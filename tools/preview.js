/* Offline preview generator: drives the real render.js + sprites through a
   fake canvas 2D context, then writes a scaled-up PNG montage. Dev-only. */
const fs = require("fs");
const zlib = require("zlib");

/* ---- fake browser just enough for the game modules ---- */
global.window = {};
global.localStorage = { _d: {}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=v;} };
["js/sprites.js","js/audio.js","js/digimon.js","js/game.js","js/battle.js","js/render.js"]
  .forEach(f => new Function("window", fs.readFileSync(f,"utf8"))(global.window));
const DV = global.window.DV;

/* ---- fake 2D context backed by an RGBA buffer ---- */
function parseColor(s){
  if (s[0] === "#"){ return [parseInt(s.slice(1,3),16),parseInt(s.slice(3,5),16),parseInt(s.slice(5,7),16),1]; }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m){ const p=m[1].split(",").map(x=>parseFloat(x)); return [p[0],p[1],p[2],p[3]===undefined?1:p[3]]; }
  return [0,0,0,1];
}
function makeCtx(W,H){
  const px = new Uint8Array(W*H*4);
  let style = "#000";
  return {
    _px:px,_W:W,_H:H, imageSmoothingEnabled:false,
    set fillStyle(v){ style=v; }, get fillStyle(){ return style; },
    fillRect(x,y,w,h){
      const c=parseColor(style), a=c[3];
      for(let j=0;j<h;j++)for(let i=0;i<w;i++){
        const X=(x|0)+i, Y=(y|0)+j; if(X<0||Y<0||X>=W||Y>=H)continue;
        const o=(Y*W+X)*4;
        px[o]  =c[0]*a+px[o]  *(1-a);
        px[o+1]=c[1]*a+px[o+1]*(1-a);
        px[o+2]=c[2]*a+px[o+2]*(1-a);
        px[o+3]=255;
      }
    },
  };
}

const W=64,H=48;
const ctx = makeCtx(W,H);
DV.render.init({ getContext:()=>ctx, width:0, height:0 });
const R=DV.render, S=DV.sprites;

function snapshot(){ return Uint8Array.from(ctx._px); }
const scenes=[];

/* Scene 1: idle menu + roaming Agumon */
R.begin();
for(let i=0;i<8;i++){ const ic=[S.icons.feed,S.icons.train,S.icons.battle,S.icons.status,S.icons.clean,S.icons.lights,S.icons.heal,S.icons.settings][i];
  if(i===0){ R.rect(i*8,0,8,8,true); R.sprite(ic,i*8,0,{invert:true}); } else R.sprite(ic,i*8,0); }
R.sprite(S.creatures.agumon,22,20);
R.textCenter("FEED",42);
scenes.push(["IDLE + MENU",snapshot()]);

/* Scene 2: status page */
R.begin();
R.text("AGUMON",2,3); R.text("ROOKIE",2,12);
R.text("HUNGER",2,22); R.hearts(2,30,3,4);
scenes.push(["STATUS",snapshot()]);

/* Scene 3: battle */
R.begin();
R.textCenter("FIGHT",1);
R.sprite(S.creatures.greymon,8,18);
R.sprite(S.creatures.metalgreymon,R.W-24,18,{flip:true});
R.sprite(S.items.ball,30,24);
scenes.push(["BATTLE",snapshot()]);

/* Scene 4: digivolve */
R.begin();
R.textCenter("DIGIVOLVE!",2);
R.sprite(S.creatures.wargreymon,24,16);
R.sprite(S.items.star,12,14); R.sprite(S.items.star,44,16);
R.textCenter("WARGREYMON",40);
scenes.push(["DIGIVOLVE",snapshot()]);

/* Scene 5: gallery of every creature */
R.begin();
const order=["egg","botamon","koromon","agumon","gabumon","greymon","garurumon","numemon","metalgreymon","skullgreymon","wargreymon"];
// fit 3 across, but 64 wide only fits 3x16=48; do 3 per row, 4 rows -> overflow H.
// Instead show first 3 here; full gallery handled by direct scaling below.
scenes.push(["(gallery below)",null]);

/* ---- compose montage PNG ---- */
const SC=6, GAP=8, LABELH=0;
const cellW=W*SC, cellH=H*SC;
const realScenes=scenes.filter(s=>s[1]);
const galleryScale=6, gW=16*galleryScale, gPer=Math.floor((cellW)/(gW+4));
const gRows=Math.ceil(order.length/gPer);
const galleryH=gRows*(gW+10)+10;

const totalW=cellW+GAP*2;
const totalH=GAP + realScenes.length*(cellH+GAP) + galleryH + GAP;
const out=new Uint8Array(totalW*totalH*4);
// bg dark
for(let i=0;i<totalW*totalH;i++){ out[i*4]=22;out[i*4+1]=28;out[i*4+2]=43;out[i*4+3]=255; }

function blit(buf, ox, oy, scale){
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const o=(y*W+x)*4;
    for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++){
      const X=ox+x*scale+sx, Y=oy+y*scale+sy;
      if(X<0||Y<0||X>=totalW||Y>=totalH)continue;
      const d=(Y*totalW+X)*4;
      out[d]=buf[o];out[d+1]=buf[o+1];out[d+2]=buf[o+2];out[d+3]=255;
    }
  }
}
let y=GAP;
for(const [name,buf] of realScenes){ blit(buf,GAP,y,SC); y+=cellH+GAP; }

/* gallery: scale sprite px directly onto green bg */
const LCD_BG=[174,186,140], LCD_ON=[32,48,15];
function drawSprite(spr, ox, oy, scale){
  // bg tile
  for(let j=0;j<spr.h*scale;j++)for(let i=0;i<spr.w*scale;i++){
    const X=ox+i,Y=oy+j,d=(Y*totalW+X)*4; out[d]=LCD_BG[0];out[d+1]=LCD_BG[1];out[d+2]=LCD_BG[2];out[d+3]=255;
  }
  for(let j=0;j<spr.h;j++)for(let i=0;i<spr.w;i++){ if(!spr.px[j][i])continue;
    for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++){
      const X=ox+i*scale+sx,Y=oy+j*scale+sy,d=(Y*totalW+X)*4;
      out[d]=LCD_ON[0];out[d+1]=LCD_ON[1];out[d+2]=LCD_ON[2];out[d+3]=255;
    }
  }
}
let gx=GAP, gy=y+4, col=0;
for(const id of order){ drawSprite(S.creatures[id], gx, gy, galleryScale);
  col++; if(col>=gPer){ col=0; gx=GAP; gy+=gW+10; } else gx+=gW+4; }

/* ---- PNG encode (RGBA, filter 0 per row) ---- */
function crcTable(){ const t=[]; for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;} return t; }
const CT=crcTable();
function crc32(buf){ let c=0xFFFFFFFF; for(let i=0;i<buf.length;i++)c=CT[(c^buf[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function chunk(type,data){ const len=Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  const t=Buffer.from(type,"ascii"); const cd=Buffer.concat([t,data]);
  const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(cd),0); return Buffer.concat([len,cd,crc]); }
const sig=Buffer.from([137,80,78,71,13,10,26,10]);
const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(totalW,0); ihdr.writeUInt32BE(totalH,4);
ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
const raw=Buffer.alloc(totalH*(totalW*4+1));
for(let r=0;r<totalH;r++){ raw[r*(totalW*4+1)]=0; Buffer.from(out.buffer,r*totalW*4,totalW*4).copy(raw,r*(totalW*4+1)+1); }
const idat=zlib.deflateSync(raw,{level:9});
const png=Buffer.concat([sig,chunk("IHDR",ihdr),chunk("IDAT",idat),chunk("IEND",Buffer.alloc(0))]);
fs.writeFileSync("tools/preview.png",png);
console.log("wrote tools/preview.png",totalW+"x"+totalH);
