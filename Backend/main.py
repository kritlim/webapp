from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, List
import math
import json
import random
import asyncio
from google import genai

app = FastAPI()

@app.get("/")
async def root():
    return {"status": "Server is running!"}

# ==========================================
# [ตั้งค่า AI API - ใส่ API Key ของคุณตรงนี้]
# ==========================================
client = genai.Client(api_key="YOUR_GEMINI_API_KEY")

class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Dict] = {}
        self.connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.connections:
            self.connections[room_id] = []
        self.connections[room_id].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        self.connections[room_id].remove(websocket)

    async def broadcast(self, message: dict, room_id: str):
        for connection in self.connections.get(room_id, []):
            await connection.send_text(json.dumps(message))

manager = RoomManager()

# --- AI & Game Logic Functions ---
AI_MODEL = "gemini-3-flash-preview"

def get_mr_white_words_from_ai(category: str):
    prompt = f"""สุ่มคำศัพท์ภาษาไทย 2 คำ ในหมวดหมู่: "{category}" ที่มีลักษณะคล้ายกันมากๆ แต่ไม่ใช่คำเดียวกัน ตอบกลับเป็น JSON Array แค่ 2 String เท่านั้น เช่น ["ทะเล", "น้ำตก"]"""
    try:
        response = client.models.generate_content(model=AI_MODEL, contents=prompt)
        raw_text = response.text.strip().replace('```json', '').replace('```', '')
        words = json.loads(raw_text)
        random.shuffle(words)
        return words
    except Exception:
        return ["คำที่1_Fallback", "คำที่2_Fallback"]

def get_level_game_word():
    prompt = """สุ่มคำศัพท์ภาษาไทย 1 คำ หรือ 1 วลีสั้นๆ ที่ใช้บอกลักษณะ นิสัย เช่น สวย, สายปาร์ตี้, ขี้เซา ตอบกลับมาแค่คำศัพท์นั้นคำเดียวเดี่ยวๆ"""
    try:
        response = client.models.generate_content(model=AI_MODEL, contents=prompt)
        return response.text.strip()
    except Exception:
        return "สายเปย์"

def assign_mr_white_roles(players: list):
    n = len(players)
    w = math.ceil(n / 6)
    rem = n - w
    a = math.ceil(rem / 2)
    roles = ["mr_white"] * w + ["team_a"] * a + ["team_b"] * (rem - a)
    random.shuffle(roles)
    return {player: roles[i] for i, player in enumerate(players)}

def assign_werewolf_roles(players: list):
    n = len(players)
    w = math.ceil(n / 6)
    roles = ["werewolf"] * w + ["villager"] * (n - w)
    random.shuffle(roles)
    assigned = {player: roles[i] for i, player in enumerate(players)}
    wolves_list = [p for p in players if assigned[p] == "werewolf"]
    return assigned, wolves_list

async def start_voting_timer(room_id: str, duration: int = 60):
    room = manager.rooms.get(room_id)
    if not room: return

    game_is_werewolf = room["state"] == "werewolf_day"

    if game_is_werewolf:
        alive = room["werewolf_data"]["alive"][:]
    else:
        dead = room.get("dead_players", [])
        alive = [p for p in room["players"] if p not in dead]

    vote_done = asyncio.Event()
    room["vote_event"]      = vote_done
    room["expected_votes"]  = len(alive)

    await manager.broadcast({"type": "start_voting", "time": duration, "alive_players": alive}, room_id)
    try:
        await asyncio.wait_for(vote_done.wait(), timeout=duration)
    except asyncio.TimeoutError:
        pass

    room = manager.rooms.get(room_id)
    if not room: return
    room.pop("vote_event", None)
    room.pop("expected_votes", None)
    votes = room.get("votes", {})

    if not votes:
        await manager.broadcast({
            "type": "vote_result", "eliminated": [], "winner": None,
            "message": "ไม่มีใครโหวตเลย! รอดทุกคน",
            "game": "werewolf" if game_is_werewolf else "mr_white",
            "alive": alive
        }, room_id)
        return

    max_votes = max(votes.values())
    eliminated_players = [p for p, v in votes.items() if v == max_votes]
    eliminated_info = []
    winner = None

    if game_is_werewolf:
        game_data = room["werewolf_data"]
        for player in eliminated_players:
            if player in game_data["alive"]:
                game_data["alive"].remove(player)
            role = game_data["roles"].get(player, "unknown")
            eliminated_info.append({"name": player, "team": role})

        alive_wolves = sum(1 for p in game_data["alive"] if game_data["roles"][p] == "werewolf")
        alive_villagers = len(game_data["alive"]) - alive_wolves
        if alive_wolves == 0:
            winner = "ชาวบ้าน (Villagers)"
        elif alive_villagers <= alive_wolves:
            winner = "หมาป่า (Werewolves)"

        room["votes"] = {}
        await manager.broadcast({
            "type": "vote_result", "eliminated": eliminated_info,
            "message": "สรุปผลการโหวต!", "winner": winner,
            "game": "werewolf", "alive": game_data["alive"]
        }, room_id)

    else:  # Mr. White
        if "dead_players" not in room:
            room["dead_players"] = []
        for player in eliminated_players:
            if player not in room["dead_players"]:
                room["dead_players"].append(player)
            role = room.get("mr_white_data", {}).get("roles", {}).get(player, "unknown")
            eliminated_info.append({"name": player, "team": role})

        roles = room.get("mr_white_data", {}).get("roles", {})
        alive_now = [p for p in room["players"] if p not in room["dead_players"]]
        teams_alive = set(roles.get(p) for p in alive_now)

        if len(teams_alive) <= 1:
            if not teams_alive:
                winner = "ไม่มีผู้ชนะ (ทุกคนตาย)"
            else:
                t = list(teams_alive)[0]
                winner = "Mr. White 🕵️" if t == "mr_white" else ("ทีม A 🔴" if t == "team_a" else "ทีม B 🔵")

        room["votes"] = {}
        await manager.broadcast({
            "type": "vote_result", "eliminated": eliminated_info,
            "message": "สรุปผลการโหวต!", "winner": winner,
            "game": "mr_white", "alive": alive_now
        }, room_id)

# --- WebSocket Endpoint ---
@app.websocket("/ws/{room_id}/{player_name}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_name: str):
    await manager.connect(websocket, room_id)
    
    if room_id not in manager.rooms:
        manager.rooms[room_id] = {"host": player_name, "players": [], "state": "lobby"}
    
    if player_name not in manager.rooms[room_id]["players"]:
        manager.rooms[room_id]["players"].append(player_name)

    await manager.broadcast({"type": "update_lobby", "room": manager.rooms[room_id]}, room_id)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            action = message.get("action")
            room = manager.rooms[room_id]

            # --- Game 1: Mr. White ---
            if action == "start_mr_white":
                category = message.get("category")
                words = get_mr_white_words_from_ai(category)
                roles = assign_mr_white_roles(room["players"])
                room["state"] = "mr_white_playing"
                room["dead_players"] = []
                room["mr_white_data"] = {"words": words, "roles": roles}
                await manager.broadcast({"type": "game_started", "game": "mr_white", "data": room["mr_white_data"]}, room_id)
            
            elif action == "trigger_vote":
                room["votes"] = {}
                asyncio.create_task(start_voting_timer(room_id, 60))
                
            elif action == "vote":
                target = message.get("target")
                if "votes" not in room: room["votes"] = {}

                # Validate target is still alive
                if room["state"] == "werewolf_day":
                    alive_now = room.get("werewolf_data", {}).get("alive", [])
                else:
                    dead = room.get("dead_players", [])
                    alive_now = [p for p in room["players"] if p not in dead]

                if target in alive_now:
                    room["votes"][target] = room["votes"].get(target, 0) + 1
                    # Early-resolve: signal timer if everyone has voted
                    total_votes = sum(room["votes"].values())
                    if total_votes >= room.get("expected_votes", float("inf")):
                        event = room.get("vote_event")
                        if event:
                            event.set()

            # --- Game 2: Werewolf ---
            elif action == "start_werewolf":
                roles, wolves = assign_werewolf_roles(room["players"])
                room["state"] = "werewolf_night"
                room["werewolf_data"] = {"roles": roles, "wolves": wolves, "alive": room["players"].copy(), "night_actions": {}, "wolf_votes": {}}
                await manager.broadcast({"type": "game_started", "game": "werewolf", "data": room["werewolf_data"]}, room_id)

            elif action == "start_werewolf_night":
                game_data = room["werewolf_data"]
                game_data["night_actions"] = {}
                game_data["wolf_votes"] = {}
                room["state"] = "werewolf_night"
                await manager.broadcast({"type": "werewolf_night", "alive": game_data["alive"]}, room_id)

            elif action == "werewolf_night_action":
                target = message.get("target")
                game_data = room["werewolf_data"]
                if player_name not in game_data["alive"]:
                    continue

                game_data["night_actions"][player_name] = True

                if game_data["roles"][player_name] == "werewolf" and target and target != player_name:
                    game_data["wolf_votes"][target] = game_data["wolf_votes"].get(target, 0) + 1

                if len(game_data["night_actions"]) == len(game_data["alive"]):
                    killed_player = None
                    if game_data["wolf_votes"]:
                        killed_player = max(game_data["wolf_votes"], key=game_data["wolf_votes"].get)
                        game_data["alive"].remove(killed_player)
                    
                    game_data["night_actions"] = {}
                    game_data["wolf_votes"] = {}
                    room["state"] = "werewolf_day"
                    
                    alive_wolves = sum(1 for p in game_data["alive"] if game_data["roles"][p] == "werewolf")
                    alive_villagers = len(game_data["alive"]) - alive_wolves
                    
                    winner = None
                    if alive_wolves == 0: winner = "ชาวบ้าน (Villagers)"
                    elif alive_villagers <= alive_wolves: winner = "หมาป่า (Werewolves)"

                    await manager.broadcast({"type": "werewolf_morning", "killed": killed_player, "winner": winner, "alive": game_data["alive"]}, room_id)

            # --- Game 3: Level Game ---
            elif action == "start_level_game":
                word = get_level_game_word()
                room["state"] = "level_game_input"
                room["level_data"] = {"word": word, "numbers": {}, "guesses": {}}
                await manager.broadcast({"type": "level_game_started", "word": word, "host": room["host"]}, room_id)

            elif action == "refresh_level_word":
                word = get_level_game_word()
                room["level_data"]["word"] = word
                await manager.broadcast({"type": "level_word_refreshed", "word": word}, room_id)

            elif action == "submit_level_number":
                room["level_data"]["numbers"][player_name] = int(message.get("number"))
                if len(room["level_data"]["numbers"]) == len(room["players"]):
                    room["state"] = "level_game_matching"
                    all_numbers = sorted(list(room["level_data"]["numbers"].values()))
                    await manager.broadcast({"type": "start_level_matching", "players": room["players"], "available_numbers": all_numbers}, room_id)

            elif action == "submit_level_guesses":
                guesses = message.get("guesses")
                room["level_data"]["guesses"][player_name] = guesses
                if len(room["level_data"]["guesses"]) == len(room["players"]):
                    actual_numbers = room["level_data"]["numbers"]
                    scores = []
                    for p_name, p_guesses in room["level_data"]["guesses"].items():
                        correct_count = sum(1 for target_p, g_num in p_guesses.items() if int(g_num) == actual_numbers[target_p])
                        scores.append({"name": p_name, "score": correct_count})
                    scores.sort(key=lambda x: x["score"], reverse=True)
                    await manager.broadcast({"type": "level_game_result", "scores": scores, "actual_numbers": actual_numbers}, room_id)

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        room = manager.rooms.get(room_id)
        if not room:
            return

        if player_name in room["players"]:
            room["players"].remove(player_name)

        # [Fix #4] Transfer host to next player if host disconnected
        if room["host"] == player_name and room["players"]:
            room["host"] = room["players"][0]

        # [Fix #2] Level Game deadlock: clean up disconnected player's data and re-check phase
        state = room.get("state", "")
        if state == "level_game_input":
            level_data = room.get("level_data", {})
            level_data.get("numbers", {}).pop(player_name, None)
            numbers = level_data.get("numbers", {})
            if room["players"] and len(numbers) == len(room["players"]):
                room["state"] = "level_game_matching"
                all_numbers = sorted(numbers.values())
                await manager.broadcast(
                    {"type": "start_level_matching", "players": room["players"], "available_numbers": all_numbers},
                    room_id
                )
        elif state == "level_game_matching":
            level_data = room.get("level_data", {})
            level_data.get("numbers", {}).pop(player_name, None)
            level_data.get("guesses", {}).pop(player_name, None)
            guesses      = level_data.get("guesses", {})
            actual_numbers = level_data.get("numbers", {})
            if room["players"] and len(guesses) == len(room["players"]):
                scores = []
                for p_name, p_guesses in guesses.items():
                    correct = sum(1 for tp, gn in p_guesses.items()
                                  if tp in actual_numbers and int(gn) == actual_numbers[tp])
                    scores.append({"name": p_name, "score": correct})
                scores.sort(key=lambda x: x["score"], reverse=True)
                await manager.broadcast(
                    {"type": "level_game_result", "scores": scores, "actual_numbers": actual_numbers},
                    room_id
                )

        # [Fix #6] Clean up empty room
        if not room["players"]:
            manager.rooms.pop(room_id, None)
            manager.connections.pop(room_id, None)
            return

        await manager.broadcast({"type": "update_lobby", "room": room}, room_id)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
