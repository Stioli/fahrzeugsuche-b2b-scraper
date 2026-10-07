/* Reiter "Vergleich" des Ankauf-Dashboards (Version 1.13, 07.10.2026) – Autohaus Stieber GmbH.
   Enthaelt keine Zugangsdaten und keine Geschaeftsdaten. Die Angebote kommen erst nach der Anmeldung
   ueber ankauf.angebotsvergleich() aus der Datenbank (Rollenpruefung dort). */
(function(){
"use strict";
/* ===== Fahrzeug-Erkennung: Text -> Felder (läuft komplett im Browser, keine Daten verlassen den Rechner) ===== */
const MAKES={"volkswagen":"Volkswagen","vw":"Volkswagen","hyundai":"Hyundai","kia":"Kia","opel":"Opel","nissan":"Nissan","cupra":"Cupra","seat":"Seat","skoda":"Škoda","škoda":"Škoda","audi":"Audi","bmw":"BMW","mercedes-benz":"Mercedes-Benz","mercedes":"Mercedes-Benz","ford":"Ford","renault":"Renault","dacia":"Dacia","peugeot":"Peugeot","citroen":"Citroën","citroën":"Citroën","toyota":"Toyota","mazda":"Mazda","volvo":"Volvo","fiat":"Fiat","suzuki":"Suzuki","honda":"Honda","mitsubishi":"Mitsubishi","porsche":"Porsche","mg":"MG","byd":"BYD","tesla":"Tesla","mini":"MINI","jeep":"Jeep","lexus":"Lexus","subaru":"Subaru","smart":"smart","ds":"DS","land rover":"Land Rover"};
const MODELS={"Hyundai":["Tucson","Kona","i10","i20","i30","Bayon","Ioniq 5","Ioniq 6","Ioniq","Santa Fe","Staria","Inster"],
 "Kia":["Sportage","Ceed","XCeed","Niro","Stonic","Picanto","EV6","EV9","EV3","Sorento","Rio","Soul"],
 "Opel":["Mokka","Corsa","Astra","Crossland","Grandland","Vivaro","Movano","Combo","Zafira","Insignia","Frontera"],
 "Nissan":["Qashqai","Juke","X-Trail","Micra","Leaf","Ariya","Townstar","Primastar","Interstar"],
 "Cupra":["Formentor","Born","Leon","Ateca","Tavascan","Terramar"],
 "Seat":["Leon","Ibiza","Arona","Ateca","Tarraco"],
 "Renault":["Clio","Captur","Symbioz","Austral","Megane","Trafic","Master","Kangoo","Arkana","Rafale"],
 "Dacia":["Sandero","Duster","Jogger","Spring","Bigster"],
 "Volkswagen":["Golf","Polo","Tiguan","Passat","T-Roc","T-Cross","Touran","ID.3","ID.4","ID.5","Caddy","Transporter","Taigo","Arteon","Touareg"],
 "Škoda":["Octavia","Fabia","Kodiaq","Karoq","Kamiq","Superb","Enyaq","Scala"],
 "Toyota":["Yaris","Corolla","RAV4","C-HR","Aygo","Camry"],
 "Ford":["Focus","Fiesta","Kuga","Puma","Tourneo Custom","Tourneo Connect","Tourneo Courier","Transit Custom","Transit Connect","Transit Courier","Transit","Mustang","Ranger"],
 "Fiat":["Panda","Grande Panda","500","Tipo","Ducato"]};
const LINES=["GSE","Black Line","Black Edition","Style Plus","N-Line","N Line","GT-Line","GT Line","ST-Line","N-Connecta","Esprit Alpine","Prime","Trend","Select","Pure","Smart","Vision","Spirit","Advance","Style","Edition","Elegance","Ultimate","Business","Shine","Sensation","Tekna+","Tekna","Acenta","Visia","Zen","Iconic","Titanium","Techno","Evolution","Active","Essential","Comfort","Extreme","Journey","Expression","Design","Platinum","Exclusive","Life","Pro","Executive","Dynamic","Intro","Xcellence"];
const EQ={
 pano:/panorama(?!-?\s*(?:r[üu]e?ckfahr\w*-?\s*)?(?:kamera|view|cam))|panoramic|schiebedach|glasdach|panoramaglas|\bpano\b/ig,
 navi:/\bnavi\b|navigation|navigationssystem/ig,
 leder:/(?<!kunst)(?<!stoff\/)(?:voll|teil)?leder(?!ersatz|imitat)/ig,
 shz:/beheizbare[rn]?\s+(?:fahrer-?\s*(?:und|\+|&)\s*beifahrer|fahrer|vorder)?-?sitze|sitz-?\s*(?:und|\+|&|\/)\s*lenkrad\w*heiz|sitzheiz|heated (?:front |rear )?seats?|\bshz\b|beheizbare[rn]? (?:vorder)?sitze|sitz\s*\+\s*lenkradheiz/ig,
 lhz:/lenkrad\w*heiz|heated steering wheel|lenkrad-?\s*(?:und|\+|&|\/)\s*(?:front|wind)?scheiben\w*heiz|\blhz\b|beheizbares lenkrad|beheizbare[rn]?\s+(?:vorder)?sitze\s+und\s+lenkrad/ig,
 led:/matrix|led[- ]?(?:scheinwerfer|licht|hauptscheinwerfer|headlight)|voll-?led|\bled\b/ig,
 kam:/r[üu]e?ckfahrkamera|\brfk\b|r[üu]ckfahrassist|(?<!innenraum)(?<!innenraum-)kamera/ig,
 k360:/360\s*°|\b360\b|surround|around view|rundumsicht|vogelperspektive/ig,
 ahk:/anh[äa]e?ngerkupplung|anh[äa]e?ngevorrichtung|zugvorrichtung|\bahk\b/ig,
 allrad:/allrad|\b4wd\b|\bawd\b|\b4x4\b|htrac|quattro|4motion|xdrive|4matic/ig,
 acc:/\bacc\b|\bscc\b|adaptive[rn]?\s+geschwindigkeitsreg(?:el|ler)\w*|adaptive[rn]? (?:abstands)?tempomat|abstandstempomat|abstandsregel\w*|adaptive cruise|smart cruise|distronic|pro\s?pilot|travel assist/ig,
 hud:/head-?up|\bhud\b|frontscheibendisplay/ig,
 heck:/heckklappe[^.,;]{0,20}elektr|elektr\w*\s+heckklappe|automatische heckklappe|\btailgate\b|\bsmart tailgate\b/ig,
 keyless:/keyless|schl[üu]ssell?os|smart\s?key|komfortzugang|zugangssystem/ig,
 sound:/\bbose\b|krell|harman|bang\s*&\s*olufsen|meridian|sennheiser|soundsystem|premium[- ]?sound|burmester|\bjbl\b/ig,
 carplay:/car\s?play|android\s*auto|smartphone[- ]?integration/ig,
 klima:/klimaautomatik|(?:dual|tri|three)[- ]?zone|[23][- ]?zonen|zwei[- ]?zonen|climatronic/ig,
 sitzbel:/sitzbel[üu]ft|ventilated (?:front )?seats?|bel[üu]ftete?\s*sitze|sitzl[üu]ftung|elektr\w*\s*(?:vorder)?sitze|memory[- ]?sitz|massagesitz/ig,
 totw:/totwinkel|toter winkel|blind spot|spurwechselassist\w*|spurhalte\w*|fahrspurassist\w*|lane (?:assist|keep)/ig
};
// Aufbau / Karosserie (Transporter) aus einem Text: liefert eine Liste wie ["Doppelkabine","Pritsche"] (leer = nicht erkennbar)
const AUFBAU_RE=[["Doppelkabine",/\b(?:doka|doppelkabin\w*|double[- ]?cab|crew[- ]?cab|mixto)\b/i],["Pritsche",/\bpritsch\w*|\bflatbed\b/i],["Kipper",/\b(?:drei|zwei|dreiseiten|zweiseiten)?kipper\b|\btipper\b/i],
  ["Koffer",/\b(?:hoch|k[üu]hl|kuehl|ka)?koffer(?!raum)\w*/i],["Kastenwagen",/\bkastenwagen\b|\bkasten\b|\bpanel van\b|\bcargo van\b|\bfurgon\b/i],["Kombi/Bus",/\bkombi\b|\bcombi\b|\bkleinbus\b|\bminibus\b|\bbus\b|\btourneo\b|\bcaravelle\b|\bmultivan\b|\bcombo life\b|\bzafira life\b/i],["Fahrgestell",/\bfahrgestell\b|\bchassis\b/i]];
function aufbauAus(txt){const s=String(txt||"");return AUFBAU_RE.filter(([,re])=>re.test(s)).map(([n])=>n)}
function clean(s){return (s||"").replace(/[   ]/g," ").replace(/\r/g,"").replace(/[ \t]+/g," ")}
function de(n){return Math.round(n).toLocaleString("de-DE")}
function pad(n){return String(n).padStart(2,"0")}
function yr(y){y=String(y);return y.length===2?"20"+y:y}
function titel(s){return s.replace(/\s+/g," ").trim().replace(/\b([a-zäöüß])([a-zäöüß]*)/g,(m,a,b)=>a.toUpperCase()+b)}
function detectEq(flat){
  const res={}, flatL=flat.replace(/vegan\w*\s+leder|leder-?lenkrad|leder-?schaltknauf|lederschalthebel|lenkrad (?:aus )?leder|schaltknauf (?:aus )?leder/ig,"");
  for(const k of Object.keys(EQ)){
    const txt=k==="leder"?flatL:flat;
    const re=new RegExp(EQ[k].source,"ig"); let m,ja=0,nein=0,unsicher=0;
    while((m=re.exec(txt))){
      const before=txt.slice(Math.max(0,m.index-32),m.index), after=txt.slice(m.index+m[0].length,m.index+m[0].length+18);
      if(/(?:ohne|kein(?:e|en|er)?|nicht|entf[äa]llt|exkl\.?)\s+(?:[\wäöüß\/+-]+\s+){0,3}$/i.test(before)) nein++;
      else if(k==="ahk"&&/^[\s-]*(?:vorbereitung|vorrüstung|vorruestung)/i.test(after)) unsicher++;
      else if(k==="ahk"&&/vorbereitung\s*(?:für|fuer)?\s*$/i.test(before)) unsicher++;
      else ja++;
    }
    res[k]=ja?1:(nein?0:null);
    if(!ja&&!nein&&unsicher) res[k]=null;
  }
  if(res.leder===1&&/synthetic[\s\-‑]*leather\s*upholstery|kunstleder(?:polster|sitze|bez[üu]ge|ausstattung)/i.test(flat)) res.leder=null;
  if(res.leder===null&&/stoff-?sitz|stoff-?bez[üu]ge|stoffpolster|polster\s*:?\s*stoff/i.test(flat)) res.leder=0;
  return res;
}
function cutTyp(typ){return typ.split(/\s[-–|•\/]\s|\s\([A-Z0-9]{2,4}\)\s|[|;•\n]|\s(?:EZ|Erstzul|ANr|Preis|FIN|Farbe|Kilometer)\b|\d[\d.]*\s?km\b|€|\d{1,3}(?:\.\d{3})+/i)[0].replace(/^[\s:,\-–/]+|[\s,.\-–/]+$/g,"").slice(0,70)}
const REVMODEL=(()=>{const r={};for(const mk of Object.keys(MODELS))for(const mo of MODELS[mk]){if(/^\d+$/.test(mo))continue;(r[mo.toLowerCase()]=r[mo.toLowerCase()]||[]).push([mk,mo])}return r})();
const REMODEL=new RegExp("(^|[^A-Za-z0-9ÄÖÜäöü])("+Object.keys(REVMODEL).sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\-]/g,"\\$&").replace(/ /g,"\\s?")).join("|")+")(?![A-Za-z0-9])","i");
function parseEinzel(raw,meta){
  meta=meta||{};
  const t=clean(raw), flat=t.replace(/\s+/g," ");
  const out={}, hinweise=[];
  const put=(k,v,c,src)=>{ if(v!==undefined&&v!==null&&String(v)!==""&&!out[k]) out[k]={v:String(v),c:c||"ok",src:(src||"").slice(0,140)} };
  const snip=(m,s)=>s.slice(Math.max(0,m.index-12),m.index+m[0].length+22).trim();
  let m;

  // FIN
  const vins=[...new Set((flat.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g)||[]).filter(v=>/[A-Z]/.test(v)&&/\d/.test(v)))];
  if(vins.length) put("fin",vins[0],"ok","FIN im Text");
  if(vins.length>1) hinweise.push("Mehrere FIN im Text ("+vins.length+") – gelesen wird das erste Fahrzeug.");

  // Hersteller / Modell / Typ
  const keys=Object.keys(MAKES).sort((a,b)=>b.length-a.length).map(k=>k.replace(/[-.]/g,"\\$&"));
  const reMake=new RegExp("(^|[^A-Za-zÄÖÜäöüß@.])("+keys.join("|")+")(?=[^A-Za-zÄÖÜäöüß.@]|$)","ig");
  let best=null;
  for(const line of t.split("\n")){
    if(/^\s*(von|from|an|to|cc|bcc|absender|empf[äa]nger)\s*:/i.test(line)) continue;
    reMake.lastIndex=0;
    while((m=reMake.exec(line))){
      const make=MAKES[m[2].toLowerCase()]; const end=m.index+m[0].length;
      if(make==="smart"&&/^[\s:-]*key\b/i.test(line.slice(end))) continue;
      let rest=line.slice(end).replace(/^[\s:,\-–()]+/,"");
      let model=null,known=false,typ="";
      for(const mo of (MODELS[make]||[]).slice().sort((a,b)=>b.length-a.length)){
        if(rest.toLowerCase().startsWith(mo.toLowerCase())&&!/[A-Za-z0-9]/.test(rest.charAt(mo.length)||" ")){model=mo;known=true;typ=rest.slice(mo.length);break;}
      }
      if(!model){const g=rest.match(/^([A-Za-z][A-Za-z0-9\-]{1,14})\b/); if(g&&!/^(angebot|preis|fahrzeug|neu|gebraucht|bitte|nach|mit|ohne|und|ist|für|fuer|von|zum)$/i.test(g[1])){model=g[1];typ=rest.slice(g[1].length);}}
      if(!model) continue;
      typ=cutTyp(typ);
      const score=(known?100:0)+Math.min(typ.length,70);
      if(!best||score>best.score) best={make,model,known,typ,score,src:line.trim()};
    }
  }
  if(!best||!best.known){
    // Listenzeilen ohne Herstellernamen („SPORTAGE 1.6 T-GDI GT Line M6 …“): Modell suchen, Hersteller daraus ableiten
    for(const line of t.split("\n")){
      const mm=line.match(REMODEL); if(!mm) continue;
      const cand=REVMODEL[mm[2].toLowerCase().replace(/\s/g,"")]||REVMODEL[mm[2].toLowerCase()]; if(!cand) continue;
      best={make:cand.length===1?cand[0][0]:null,model:cand[0][1],known:true,typ:cutTyp(line.slice(mm.index+mm[0].length).replace(/^[\s:,\-–()]+/,"")),score:100,src:line.trim(),abgeleitet:true};
      break;
    }
  }
  if(best&&best.known){
    // Fahrzeugzeile ohne Herstellernamen („7x TUCSON FL 1.6T 239 PS HEV AT BLACK LINE“) liefert oft den volleren Typ als der Einleitungssatz
    for(const line of t.split("\n")){
      const mm=line.match(REMODEL); if(!mm) continue;
      const cand=REVMODEL[mm[2].toLowerCase().replace(/\s/g,"")]||REVMODEL[mm[2].toLowerCase()];
      if(!cand||cand[0][1].toLowerCase()!==String(best.model).toLowerCase()) continue;
      const t2=cutTyp(line.slice(mm.index+mm[0].length).replace(/^[\s:,\-–()]+/,""));
      if(t2.length>best.typ.length+3&&/\d/.test(t2)){best.typ=t2;best.src=line.trim();break;}
    }
  }
  if(best){
    if(best.make) put("hersteller",best.make,best.abgeleitet?"unsicher":"ok",best.abgeleitet?"aus dem Modell abgeleitet: "+best.src:best.src);
    put("modell",best.model,best.known?"ok":"unsicher",best.src);
    if(best.typ) put("typ",best.typ,"ok",best.src);
  }
  // Linie
  const typTxt=(out.typ?out.typ.v:"")+" "+((flat.match(/(?:Ausstattungslinie|Ausstattungsvariante|Linie)\s*[:.]?\s*([A-Za-z0-9+\- ]{2,24})/i)||[])[1]||"");
  for(const L of LINES.slice().sort((a,b)=>b.length-a.length)){
    const re=new RegExp("(?:^|[^A-Za-z0-9])("+L.replace(/[-+ ]/g,c=>c==="+"?"(?:\\+|[-\\s]?plus)":"[-\\s]?")+")(?![A-Za-z0-9])","i");
    if((m=typTxt.match(re))){ put("linie",L.replace("N Line","N-Line").replace("GT Line","GT-Line"),"ok",m[0].trim()); break; }
  }

  // Zustand
  if((m=flat.match(/\b(Neufahrzeug|Neuwagen|Tageszulassung|Tageszulassungen|Jahreswagen|Vorf[üu]hrwagen|Gebrauchtwagen|Gebrauchtfahrzeug)\b/i))){
    const z=m[1].toLowerCase(); put("zustand",/neu/.test(z)?"Neu":/tages/.test(z)?"Tageszulassung":/jahres/.test(z)?"Jahreswagen":/vorf/.test(z)?"Vorführwagen":"Gebraucht","ok",snip(m,flat));
  }
  else if(/(?:^|\n)[ \t]*Neu[ \t]*(?:\n|$)/i.test(t)) put("zustand","Neu","unsicher","eigene Zeile „Neu“ im Text");
  else if(/zulassung\s+nach\s+kauf/i.test(flat)) put("zustand","Neu (Zulassung nach Kauf)","unsicher","„Zulassung nach Kauf“ im Text");
  else if(/\bohne\s+EZ\b/i.test(flat)) put("zustand","Neu (ohne EZ)","unsicher","„ohne EZ“ im Text");
  // Besteuerung
  if((m=flat.match(/differenzbesteuer\w*|§\s*25\s*a/i))&&!/^\s*nicht/i.test(flat.slice(m.index+m[0].length,m.index+m[0].length+10))) put("steuer","Differenzbesteuert","ok",snip(m,flat));
  else if((m=flat.match(/mwst\.?\s*ausweisbar|mehrwertsteuer\s*ausweisbar|regelbesteuert|zzgl\.?\s*(?:19\s*%\s*)?mwst|zzgl\.?\s*mwst/i))) put("steuer","MwSt. ausweisbar","ok",snip(m,flat));

  // Preis
  const cands=[];
  const addP=(mm,valStr,labeled)=>{
    const val=parseInt(valStr.replace(/[.\s]/g,""),10); if(val<3000||val>250000) return;
    const before=flat.slice(Math.max(0,mm.index-45),mm.index), after=flat.slice(mm.index+mm[0].length,mm.index+mm[0].length+30), self=mm[0];
    if(/fracht|[üu]berf[üu]hr|anzahlung|rate\b|mtl|monat|uvp|neupreis|listenpreis|garantie|zubeh[öo]r|aufpreis|zulassungskosten/i.test(before.slice(-28).split(/€|EUR|Euro/i).pop())) return;
    if(cands.some(c=>c.val===val&&Math.abs(c.idx-mm.index)<30)) return;
    let art="unbekannt";
    if(/netto|zzgl|exkl|ohne\s*mwst/i.test(self)) art="netto";
    else if(/brutto|inkl|mit\s*mwst|endpreis/i.test(self)) art="brutto";
    else if(/^\s*\(?\s*(netto|zzgl|exkl|ohne\s*mwst)/i.test(after)) art="netto";
    else if(/^\s*\(?\s*(brutto|inkl|mit\s*mwst)/i.test(after)) art="brutto";
    else if(/netto|zzgl|exkl|ohne\s*mwst|\bek\b/i.test(before.slice(-32))) art="netto";
    else if(/brutto|inkl|mit\s*mwst|endpreis/i.test(before.slice(-42))) art="brutto";
    cands.push({val,art,idx:mm.index,label:labeled||/preis|vk|angebot|\bek\b|kaufpreis|endpreis|h[äa]ndler/i.test(before.slice(-32)),src:snip(mm,flat)});
  };
  const NUM="(\\d{1,3}(?:[.\\s]\\d{3})+|\\d{4,6})";
  let pm;
  const rA=new RegExp(NUM+"(?:,(?:\\d{1,2}|-))?\\s*(?:€|EUR|Euro)","gi"); while((pm=rA.exec(flat))) addP(pm,pm[1],false);
  const rB=new RegExp("(?:€|EUR)\\s*"+NUM+"(?:,(?:\\d{1,2}|-))?(?![\\d.])","gi"); while((pm=rB.exec(flat))) addP(pm,pm[1],false);
  const rC=new RegExp("(?<![A-Za-zäöüß])(?:Preis|VK|EK|Kaufpreis|Angebotspreis|Verkaufspreis|H[äa]ndlerpreis|Endpreis|Netto|Brutto)(?:\\s*(?:netto|brutto))?\\s*[:=]?\\s*"+NUM+"(?:,(?:\\d{1,2}|-))?(?![\\d.])","gi"); while((pm=rC.exec(flat))) addP(pm,pm[1],true);
  // Tabellenzeilen („7 KIA SPORTAGE … 33 200“): Preis ohne €-Zeichen am Zeilenende, nur wenn sonst nichts gefunden wurde
  if(!cands.length){const rD=/(?<![\d.,])(\d{2,3}[ .]\d{3})[ \t]*$/gm; while((pm=rD.exec(t))){if(/(?:tel|fax|mobil|phone|handy|plz|nr|id)\.?:?\s*[\d +()\/-]*$/i.test(t.slice(Math.max(0,pm.index-30),pm.index))) continue; const ix=flat.indexOf(pm[1]);addP({index:ix<0?0:ix,0:pm[0]},pm[1],false);}}
  const pick=cands.find(c=>c.art==="netto"&&c.label)||cands.find(c=>c.art==="netto")||cands.find(c=>c.art==="brutto"&&c.label)||cands.find(c=>c.art==="brutto")||cands.find(c=>c.label)||cands[0];
  if(pick){
    put("preis",pick.val,pick.art==="unbekannt"?"unsicher":"ok",pick.src);
    put("preisart",pick.art==="unbekannt"?"netto":pick.art,pick.art==="unbekannt"?"unsicher":"ok",pick.art==="unbekannt"?"Preisart nicht im Text – bitte prüfen":pick.src);
    const andere=cands.filter(c=>c!==pick&&c.val!==pick.val&&Math.abs(c.val/pick.val-1.19)>0.015&&Math.abs(pick.val/c.val-1.19)>0.015);
    if(andere.length) hinweise.push("Weitere Preise im Text: "+[...new Set(andere.map(c=>de(c.val)+" €"))].join(", ")+" – verwendet: "+de(pick.val)+" € ("+pick.art+"). Bitte prüfen.");
  }

  // Erstzulassung
  const lab="\\b(?:Erstzulassung|Erstzul\\.?|EZ|1\\.\\s*Zulassung)";
  let ez=null,ezc="ok",ezsrc="";
  if((m=flat.match(new RegExp(lab+"\\s*[:.]?\\s*(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})","i")))){ez=pad(m[2])+"/"+m[3];ezsrc=snip(m,flat);}
  else if((m=flat.match(new RegExp(lab+"\\s*[:.]?\\s*(\\d{1,2})[./-](\\d{4}|\\d{2})\\b","i")))){ez=pad(m[1])+"/"+yr(m[2]);ezsrc=snip(m,flat);}
  else if((m=flat.match(new RegExp(lab+"\\s*[:.]?\\s*(\\d{4})-(\\d{2})","i")))){ez=m[2]+"/"+m[1];ezsrc=snip(m,flat);}
  else if((m=flat.match(new RegExp(lab+"\\s*[:.]?\\s*(\\d{4})\\b","i")))){ez=m[1];ezc="unsicher";ezsrc=snip(m,flat);}
  else if((m=flat.match(/\b(0[1-9]|1[0-2])\/(20\d{2})\b/))){ez=m[1]+"/"+m[2];ezc="unsicher";ezsrc=snip(m,flat);}
  if(!ez&&(m=flat.match(/\b(?:mit\s+)?Zulassung\s+(?:im\s+|ab\s+)?(Januar|Februar|M[äa]rz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b/i))){
    const MON={januar:1,februar:2,märz:3,maerz:3,april:4,mai:5,juni:6,juli:7,august:8,september:9,oktober:10,november:11,dezember:12};
    ez=pad(MON[m[1].toLowerCase()])+"/"+m[2];ezc="unsicher";ezsrc=snip(m,flat)+" (Zulassung vorgesehen, nicht bestätigt)";
  }
  if(ez) put("ez",ez,ezc,ezsrc);

  // Kilometer
  let kmv=null,kmsrc="",kmc="ok";
  if((m=flat.match(/(?:Kilometerstand|km-?Stand|Laufleistung|Kilometer)\s*[:.]?\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)/i))||(m=flat.match(/\bKM\s*[:=]\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)/))){kmv=parseInt(m[1].replace(/[.\s]/g,""),10);kmsrc=snip(m,flat);}
  else{
    const re=/(?<![\/\d.,])(\d{1,3}(?:\.\d{3})+|\d+)\s*km\b(?!\s*\/)/gi; let mm;
    while((mm=re.exec(flat))){const v=parseInt(mm[1].replace(/\./g,""),10); if(v<=400000){kmv=v;kmsrc=snip(mm,flat);kmc="ok";break;}}
  }
  if(kmv!==null&&kmv<=400000) put("km",de(kmv)+" km",kmc,kmsrc);

  // Leistung
  const kw=flat.match(/(\d{2,3})\s*kW\b/i), ps=flat.match(/(\d{2,3})\s*(?:PS|hp)\b/i);
  if(kw&&ps) put("leistung",kw[1]+" kW ("+ps[1]+" PS)","ok",snip(kw,flat));
  else if(kw) put("leistung",kw[1]+" kW ("+Math.round(+kw[1]*1.35962)+" PS)","unsicher","PS aus kW berechnet: "+snip(kw,flat));
  else if(ps) put("leistung",Math.round(+ps[1]/1.35962)+" kW ("+ps[1]+" PS)","unsicher","kW aus PS berechnet: "+snip(ps,flat));
  // Aufbau / Karosserie (Transporter): zuerst Titel und Typzeile, sonst der ganze Text
  {
    const kopf=(out.typ?out.typ.v+" ":"")+(out.modell?out.modell.v+" ":"")+flat.slice(0,300);
    let hit=aufbauAus(kopf),unsicher=false;
    if(!hit.length){hit=aufbauAus(flat);unsicher=hit.length>0;}
    if(hit.length) put("aufbau",hit.slice(0,2).join(" + "),unsicher?"unsicher":"ok",unsicher?"im Text (nicht im Titel): "+hit.join(", "):"im Titel/Typ: "+hit.join(", "));
  }
  // Sitzplaetze: „Sitze 9“, „Sitzplätze: 7“, „9-Sitzer“, „7 Sitzer“, „5 seats“
  // Vorrang: eigene Zeile „8 Sitze“ > „Sitze 8“/„Sitzplätze: 8“ > „8-Sitzer“ nur im Titel/Kopf (nicht „2-Sitzer“ aus Ausstattungspaketen)
  if((m=t.match(/^[ \t]*(\d{1,2})[ \t]*(?:Sitze|Sitzpl[äa]tze|Sitzer|seats)[ \t]*$/im)||flat.match(/\b(?:Sitzpl[äa]tze|Sitzplatz|Sitze|Seats)\s*[:=]?\s*(\d{1,2})\b/i)||flat.slice(0,400).match(/\b(\d{1,2})\s*[- ]?\s*(?:Sitzer|Sitzig|seater|seats)\b/i))&&+m[1]>=1&&+m[1]<=9) put("sitze",m[1],"ok",snip({index:Math.max(0,flat.indexOf(m[0].trim())),0:m[0].trim()},flat));
  if((m=flat.match(/(\d[.\d]{2,5})\s*(?:cm³|cm3|ccm)/i))) put("hubraum",de(parseInt(m[1].replace(/\./g,""),10))+" cm³","ok",snip(m,flat));

  // Kraftstoff
  const kLab=(t.match(/(?:^|\n|\s)Kraftstoff(?:art)?\s*:\s*([^\n|;]{3,40})/i)||[])[1];
  // „not applicable to PHEV“, „(for PHEV)“, „except PHEV“, „außer PHEV“ sind keine Aussage zum Fahrzeug
  const kText=(kLab?kLab+" ":"")+flat.replace(/\(?\s*(?:not\s+applicable\s+to|not\s+for|for|except|excl\.?|au(?:ß|ss)er|nicht\s+f[üu]r)\s+(?:the\s+)?(?:phev|plug-?in[- ]?hybrid)s?\s*\)?/ig," ");
  const kr=[[/plug-?in|\bphev\b/i,"Plug-in-Hybrid"],[/mild[- ]?hybrid|\bmhev\b|\b48\s?v\b/i,"Mild-Hybrid (Benzin)"],[/full[- ]?hybrid|hybrid|\bhev\b|e-?tech\b|e-?power/i,"Hybrid (Benzin/Elektro)"],
    [/diesel|\btdi\b|cdti|crdi|\bdci\b|bluehdi|\bhdi\b|multijet/i,"Diesel"],[/\belektro(?![a-zäöüß\/])|\bbev\b|vollelektrisch|\bkwh\b/i,"Elektro"],[/\blpg\b|autogas/i,"Autogas (LPG)"],[/\bcng\b|erdgas/i,"Erdgas (CNG)"],
    [/benzin|super e10|\bsuper\b|\btsi\b|\btfsi\b|t-gdi|\bgdi\b|puretech|\btce\b|ecoboost/i,"Benzin"]];
  for(const [re,name] of kr){ if(re.test(kLab||"")){put("kraft",name,"ok","Kraftstoff: "+kLab);break;} }
  if(!out.kraft) for(const [re,name] of kr){ if((m=kText.match(re))){put("kraft",name,"ok",snip(m,kText));break;} }
  if(!out.kraft&&/\be-?GSE\b|\bMokka-?e\b|\bCorsa-?e\b|on-?board-?charger|ladekabel|wallbox|ladeleistung/i.test(kText)) put("kraft","Elektro","unsicher","Hinweis auf E-Antrieb im Text (z. B. e-GSE, On-Board-Charger, Ladekabel)");
  if(out.kraft&&out.kraft.v==="Mild-Hybrid (Benzin)"&&!/benzin|t-gdi|tsi|tce|gdi/i.test(kText)) out.kraft.v="Mild-Hybrid";

  // Getriebe
  const gLab=(t.match(/(?:^|\n|\s)Getriebe(?:art)?\s*:\s*([^\n|;]{3,40})/i)||[])[1];
  const gTxt=gLab||flat;
  const reA=/\b(dsg|dct|edc|[sx]-?tronic|tiptronic|cvt|stufenlos|automatik\w*|automatic|doppelkupplung\w*|[5-9]\s?(?:at|dct|edc))\b/i, reS=/schaltgetriebe|schaltung|handschalt\w*|manuell\w*|\bmt\b|\bmanual\b/i;
  // Kuerzel wie M6 (Schalter 6-Gang), A7 (Automatik 7-Gang), DCT7, 6MT – nicht bei Audi (A6/A7/A8) und BMW (M5/M6)
  const mk=out.hersteller?out.hersteller.v:"";
  const reCode=/(?<![A-Za-z0-9])(MT|M|AT|A|DCT|DSG|EDC)\s?([5-8])(?![A-Za-z0-9])|(?<![A-Za-z0-9])([5-8])\s?(MT|AT|DCT|DSG|EDC)(?![A-Za-z0-9])/ig;
  let gc,codeHit=null;
  while((gc=reCode.exec(flat))){
    const kz=(gc[1]||gc[4]).toUpperCase(),n=gc[2]||gc[3];
    if(kz==="A"&&mk==="Audi")continue; if(kz==="M"&&mk==="BMW")continue;
    codeHit={name:(kz==="M"||kz==="MT")?"Schaltgetriebe":"Automatik",gears:n,src:snip(gc,flat)};break;
  }
  if(codeHit&&!gLab){ put("getr",codeHit.name+" ("+codeHit.gears+"-Gang)","ok","Kürzel: "+codeHit.src); }
  const ga=gTxt.match(reA), gs=gTxt.match(reS);
  let gname=null;
  if(ga&&gs) gname=ga.index<gs.index?"Automatik":"Schaltgetriebe"; else if(ga) gname="Automatik"; else if(gs) gname="Schaltgetriebe";
  if(gname&&!out.getr){
    const gg=(gTxt.match(/(\d)\s*[- ]?\s*(?:gang|gears|speed|stufen)\b/i)||gTxt.match(/\b([5-9])\s?(?:at|dct|edc|dsg)\b/i)||flat.match(/(\d)[- ]?gang/i)||[]);
    put("getr",gname+(gg[1]?" ("+gg[1]+"-Gang)":""),"ok",(ga||gs)?snip({index:0,0:gTxt.slice(0,40)},gTxt):"");
  }
  if(!out.getr&&out.typ&&/(?<![A-Za-z0-9])AT(?![A-Za-z0-9])/.test(out.typ.v)) put("getr","Automatik","unsicher","Kürzel „AT“ in der Typzeile: "+out.typ.v);

  // Antrieb
  // Der zuerst genannte Antrieb gilt (spaetere Nennungen stehen oft in Optionen: „… (AWD und mLSD)“, „[nur FWD]“)
  {
    const AN=[["Allrad",/\b(allrad\w*|4wd|awd|4x4|htrac|quattro|4motion|xdrive|4matic)\b/ig],["Frontantrieb",/\b(frontantrieb|vorderradantrieb|2wd|4x2|fwd)\b|\bAntrieb\s*[:=]?\s*(front)\b/ig],["Heckantrieb",/\b(heckantrieb|hinterradantrieb|rwd)\b/ig]];
    let best=null;
    for(const [name,re] of AN){let mm;re.lastIndex=0;
      while((mm=re.exec(flat))){ if(name==="Allrad"&&/(?:ohne|kein)\s+$/i.test(flat.slice(Math.max(0,mm.index-12),mm.index))) continue; if(!best||mm.index<best.m.index) best={name,m:mm}; break; } }
    if(best) put("antrieb",best.name,"ok",snip(best.m,flat));
  }

  // Farbe / Innen
  const fm=t.match(/(?<![A-Za-zäöüß])(?:Au(?:ß|ss)enfarbe|Lackfarbe|Lackierung|Farbe)(?![A-Za-zäöüß])\s*[:.]?\s*([^\n|;]{3,40})/i);
  const fl=t.match(/(?<![A-Za-zäöüß])(?:Verf[üu]gbare |Lieferbare |Wählbare |W[äa]hlbare )?Farben(?![A-Za-zäöüß])\s*:?\s*([^\n]{3,400})/i);
  if(fl&&!fm){ const n=(fl[1].match(/\(\s*[A-Z0-9]{1,4}\s*\)/g)||fl[1].split(/,/)).length; hinweise.push("Mehrere Farben zur Wahl ("+n+") – die Außenfarbe bitte selbst eintragen."); }
  if(fm) put("farbe",titel(fm[1].split(/,\s*|\s+(?:innen|polster|interieur)\b/i)[0]).replace(/\bMetallic\b/,"Metallic"),"ok",fm[0]);
  const im=t.match(/(?<![A-Za-zäöüß])(?:Innenausstattung|Interieur|Polsterung|Polster|Sitzbez[üu]ge)[ \t]*[:.]?[ \t]*([^\n|;]{3,50})/i);
  if(!im&&/Stoff-?sitzbez[üu]ge|Stoffbez[üu]ge/i.test(t)) put("innen","Stoff","ok","Stoffsitzbezüge im Text");
  if(im) put("innen",im[1].trim().replace(/[.,;]+$/,""),"ok",im[0]);

  // Felgen
  {const fa=[...flat.matchAll(/\b(1[5-9]|2[0-2])\s*(?:["”″']|-?\s?zoll)/ig)]; if(fa.length){m=fa[fa.length-1]; put("felgen",m[1]+'"',"ok",snip(m,flat));}}
  if(out.felgen){}
  if(!out.felgen&&(m=flat.match(/(?:alu|leichtmetall|lm)[-\s]*(?:felgen|r[äa]der)?\s*(1[5-9]|2[0-2])\b/i))) put("felgen",m[1]+'"',"ok",snip(m,flat));

  // Angebotsdaten
  if((m=t.match(/(?:ANr\.?|Angebots[-\s]?(?:nummer|nr\.?)|Fahrzeug[-\s]?(?:nummer|nr\.?)|Kommission(?:snummer)?|Stock[-\s]?Nr\.?)\s*[:.]?\s*([A-Z0-9][A-Z0-9\-\/]{3,20})/i))) put("anr",m[1],"ok",m[0]);
  if((m=t.match(/(?:Fahrzeug)?standort\s*[:.]?\s*([^\n|;]{2,40})/i))) put("standort",m[1].split(/\.\s|;|\s{2,}/)[0].trim().replace(/[.,;]+$/,""),"ok",m[0]);
  if(/nicht\s+auf\s+lager|nicht\s+lagernd|kein\s+lagerbestand/i.test(flat)) put("verf","nicht auf Lager","ok","„nicht auf Lager“ im Text");
  else if(/sofort\s*(?:verf[üu]gbar|lieferbar)|ab\s*lager|\blager\b/i.test(flat)) put("verf","sofort","ok","„sofort“/„Lager“ im Text");
  else if((m=flat.match(/Lieferzeit\s*[:.]?\s*(?:ca\.?\s*)?(\d+(?:\s*[-–]\s*\d+)?)\s*(Tage|Wochen|Werktage)/i))) put("verf",m[1]+" "+m[2],"ok",snip(m,flat));
  else if((m=flat.match(/verf[üu]gbar\s*ab\s*([\d./]+)/i))) put("verf","ab "+m[1],"ok",snip(m,flat));
  const lm=t.match(/(?:Anbieter|H[äa]ndler|Verk[äa]ufer|Lieferant)[ \t]*:[ \t]*([^\n|;]{3,50})/i);
  if(lm) put("anbieter",lm[1].trim(),"ok",lm[0]);
  else{
    const co=[...t.matchAll(/([A-ZÄÖÜ][\wäöüß&.\-]*(?: +[A-ZÄÖÜ&][\wäöüß&.\-]*){0,4} +(?:GmbH(?: *& *Co\.? *KG)?|AG|KG|e\.K\.|B\.V\.|BVBA|N\.V\.|Group|Sp\. ?z ?o\. ?o\.|S\.L\.|S\.R\.L\.|SRL|Ltd\.?))/g)];
    if(co.length) put("anbieter",co[co.length-1][1],"unsicher","Firmenname im Text: "+co[co.length-1][1]);
    else if(meta.from) put("anbieter",meta.from,"unsicher","aus dem Absender der E-Mail");
    else if((m=t.match(/[\w.+-]+@((?!autohaus-stieber)[\w-]+(?:\.[\w-]+)+)/i))) put("anbieter",m[1].toLowerCase(),"unsicher","nur E-Mail-Domain im Text: "+m[0]);
  }
  if((m=t.match(/https?:\/\/[^\s)>"'<\[\]]+/))) put("link",m[0],"ok","Link im Text");

  const eq=detectEq(flat);
  if(eq.k360===1&&eq.kam===null) eq.kam=1;
  // Der zuerst genannte Antrieb entscheidet; „AWD“ nur in Optionen/Fahrmodi („Frontantrieb … (AWD und mLSD)“) macht kein Allrad
  if(out.antrieb){ if(out.antrieb.v==='Frontantrieb'||out.antrieb.v==='Heckantrieb') eq.allrad=0; else if(out.antrieb.v==='Allrad') eq.allrad=1; }
  return {felder:out,eq,hinweise};
}

/* ===== Preislisten mit mehreren Varianten (Paket- und Listenangebote) ===== */
const REPREIS=/(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})(?:,(?:-|\d{1,2}))?\s*(?:€|EUR|Euro)/i;
function findeVarianten(t){
  const lines=t.split("\n"), out=[];
  for(let i=0;i<lines.length;i++){
    const L=lines[i]; if(!L.trim()||!REMODEL.test(L)) continue;
    let pl=null,pj=-1;
    for(let j=i;j<=Math.min(i+2,lines.length-1);j++){
      if(j>i&&REMODEL.test(lines[j])) break;
      const m=lines[j].match(REPREIS); if(m&&parseInt(m[1].replace(/[.\s]/g,""),10)>=3000){pl=lines[j];pj=j;break;}
    }
    if(!pl) continue;
    out.push({zeile:i,titel:L.trim().replace(REPREIS,"").replace(/\s{2,}/g," ").trim(),preisZeile:pl.trim(),bis:pj});
  }
  const uniq=[]; for(const v of out){ if(!uniq.some(u=>u.titel===v.titel&&u.preisZeile===v.preisZeile)) uniq.push(v); }
  return uniq.length>=2?uniq:[];
}
function serienAbschnitte(lines){
  const sec=[]; let cur=null;
  for(const raw of lines){
    const l=raw.trim(); if(!l) continue;
    if(/^[•·]/.test(l)||(cur&&/^[•·\-\*]\s/.test(l))){ if(cur) cur.bullets.push(...l.split(/[•·]/).map(x=>x.trim()).filter(Boolean)); continue; }
    const h=l.match(/^([A-Za-zÄÖÜäöüß0-9][^•\n]{1,38}?)(?:\s*\(\s*zus[äa]tzlich zu\s+([^)]+)\))?\s*$/i);
    if(h&&l.length<60&&!/[.:;]$/.test(l)){ cur={name:h[1].trim(),base:h[2]?h[2].trim():null,bullets:[]}; sec.push(cur); }
    else if(cur) cur.bullets.push(l);
  }
  return sec;
}
function serienText(lines,titel){
  const sec=serienAbschnitte(lines); if(!sec.length) return "";
  let linie=null;
  for(const L of LINES.slice().sort((a,b)=>b.length-a.length)){ if(new RegExp("(?:^|[^A-Za-z0-9])"+L.replace(/[-+ ]/g,"[-\\s]?")+"(?![A-Za-z0-9])","i").test(titel)){linie=L;break;} }
  if(!linie) return "";
  const find=n=>sec.find(x=>x.name.toLowerCase().replace(/\s+/g," ")===String(n).toLowerCase().replace(/\s+/g," "));
  const chain=[]; let c=find(linie), guard=0;
  while(c&&guard++<5){ chain.unshift(c); c=c.base?find(c.base):null; }
  if(!chain.length) return "";
  const tokens=(titel.match(/\b[A-Z0-9]{2,6}\b/g)||[]).map(x=>x.toUpperCase());
  const ok=b=>{
    const n=b.match(/\bnur\s+(?:bei\s+)?([A-Za-z0-9]+)/i), a=b.match(/\bau(?:ß|ss)er\s+([A-Za-z0-9]+)/i);
    if(n&&!tokens.includes(n[1].toUpperCase())) return false;
    if(a&&tokens.includes(a[1].toUpperCase())) return false;
    return true;
  };
  const strip=b=>b.replace(/\s*\/?\s*\(?\s*(?:nur|au(?:ß|ss)er)\s+(?:bei\s+)?[A-Za-z0-9]+\s*\)?\s*$/i,"");
  return chain.flatMap(x=>x.bullets).filter(ok).map(strip).join("\n");
}
function kopfFakten(t,vars){
  const lines=t.split("\n"), kopf=lines.slice(0,vars[0].zeile).join("\n"), res={felder:{},hinweise:[]}, m1=kopf.match.bind(kopf);
  let m;
  if((m=m1(/ab Lager\s+(\d{5}\s+[A-ZÄÖÜ][^\n,;]{2,40})/))) res.felder.standort={v:m[1].trim(),c:"ok",src:m[0]};
  if(/\bab Lager\b|\blager\b/i.test(kopf)) res.felder.verf={v:"ab Lager",c:"ok",src:"„ab Lager“ im Kopftext"};
  if((m=m1(/([A-ZÄÖÜ][\wäöüß]+(?: [A-ZÄÖÜ][\wäöüß]+){0,2})\s*[-–]\s*ihr Spezialist/i))) res.felder.anbieter={v:m[1].trim(),c:"unsicher",src:"aus dem Kopftext: "+m[0].slice(0,60)};
  if((m=m1(/Abnahme\s+Zugweise\s+(\d+)\s+St[üu]ck[^\n]*/i))) res.hinweise.push("Paketkondition im Text: "+m[0].trim().slice(0,120));
  return res;
}
function varianteText(t,vars,idx){
  const lines=t.split("\n"), v=vars[idx], next=idx+1<vars.length?vars[idx+1].zeile:lines.length;
  let end=next; for(let i=v.zeile+1;i<next;i++){ if(/^\s*Serienausstattung/i.test(lines[i])){end=i;break;} }
  let text=lines.slice(v.zeile,end).join("\n");
  const sa=lines.findIndex(l=>/^\s*Serienausstattung/i.test(l));
  if(sa>=0) text+="\n"+serienText(lines.slice(sa+1),v.titel);
  return text;
}
function parseVariante(raw,idx,meta){
  const t=clean(raw), vars=findeVarianten(t);
  if(vars.length<2) return parseEinzel(raw,meta);
  idx=Math.min(Math.max(idx|0,0),vars.length-1);
  const r=parseEinzel(varianteText(t,vars,idx),meta), kf=kopfFakten(t,vars);
  for(const k of Object.keys(kf.felder)) if(!r.felder[k]) r.felder[k]=kf.felder[k];
  r.varianten=vars.map(v=>({titel:v.titel,preis:v.preisZeile}));
  r.aktiv=idx;
  r.hinweise=[vars.length+" Varianten im Text – die gewählte Variante steht in den Feldern, unten kannst du eine andere wählen."].concat(r.hinweise,kf.hinweise);
  return r;
}
function parseVehicle(raw,meta){ return parseVariante(raw,0,meta); }

/* ===================== Reiter „Vergleich“ (Dashboard 1.13, 07.10.2026) ===================== */
/* Zweck: ein Fahrzeug einlesen (Text/PDF/E-Mail) und mit den Angeboten aus ankauf.angebote vergleichen.     */
/* Daten: db.rpc("angebotsvergleich") – Rollenpruefung (admin/verkauf) und RLS erledigt die Datenbank.        */
/* Nur Einkaufspreise, kein Marktwert, kein Preisabzug fuer Ausstattung. Alles Einlesen laeuft im Browser.    */
const J=1,N=0,U=null;
const FEAT1=[["pano","Pano"],["navi","Navi"],["leder","Leder"],["shz","SHZ"],["lhz","LHZ"],["led","LED/Matrix"],["kam","RFK"],["k360","360°"],["ahk","AHK"],["allrad","Allrad"]];
const FEAT2=[["acc","ACC"],["hud","Head-up"],["heck","El. Heckkl."],["keyless","Keyless"],["sound","Sound"],["carplay","CarPlay/AA"],["klima","Klima-Aut."],["sitzbel","Sitze bel./el."],["totw","Totwinkel/Spur"]];
const FEAT=FEAT1.concat(FEAT2);
const LANG={pano:"Panoramadach",navi:"Navigation",leder:"Leder",shz:"Sitzheizung",lhz:"Lenkradheizung",led:"LED/Matrix-Licht",kam:"Rückfahrkamera",k360:"360°-Kamera",ahk:"Anhängerkupplung",allrad:"Allrad",acc:"Abstandstempomat (ACC)",hud:"Head-up-Display",heck:"El. Heckklappe",keyless:"Keyless",sound:"Soundsystem",carplay:"CarPlay/Android Auto",klima:"Klimaautomatik",sitzbel:"Sitze belüftet/elektrisch",totw:"Totwinkel-/Spurassistent"};
const FIELDS=[
 ["Fahrzeug",[["hersteller","Hersteller"],["modell","Modell"],["typ","Typ / Variante","w2"],["aufbau","Aufbau / Karosserie"],["linie","Ausstattungslinie"],["zustand","Zustand"]]],
 ["Zulassung & Kennung",[["ez","Erstzulassung (MM/JJJJ)"],["km","Kilometerstand"],["fin","FIN"],["anr","Angebots-Nr."]]],
 ["Technik",[["leistung","Leistung"],["hubraum","Hubraum"],["sitze","Sitzplätze"],["kraft","Kraftstoff"],["getr","Getriebe"],["antrieb","Antrieb"],["farbe","Außenfarbe"],["innen","Innenausstattung","w2"],["felgen","Felgen"]]],
 ["Preis",[["preis","Preis in €"],["preisart","Preisart","sel:netto|brutto"],["steuer","Besteuerung","sel:unbekannt|MwSt. ausweisbar|Differenzbesteuert"]]],
 ["Angebot",[["anbieter","Anbieter"],["standort","Standort / Land"],["verf","Verfügbarkeit / Lieferzeit"],["link","Link zum Angebot","w2"]]]
];
const ALLKEYS=FIELDS.flatMap(g=>g[1].map(f=>f[0]));
const LABEL=Object.fromEntries(FIELDS.flatMap(g=>g[1].map(f=>[f[0],f[1]])));
const $=id=>document.getElementById(id);
const E=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const eur=n=>Math.round(n).toLocaleString("de-DE")+" €";
const sym=v=>v===J?'<span class="vg-ja">✔</span>':v===N?'<span class="vg-nein">✘</span>':'<span class="vg-unb">?</span>';
let V={},CONF={},SRC={},REFEQ={},META={},ROWS=[],ROWKEY="",FRACHT=300,QUELLEN=[],FIL=neuFilter(),sortKey="preis",sortDir=1,openId=null,built=false,loading=false,SNAP=null;
function neuFilter(){return{kraft:null,getr:null,linie:null,linieUnb:true,aufbau:null,aufbauUnb:true,ezAb:null,kmBis:null,ps:true,gleich:false,pano:false,sicher:false,aktuell:false,mehr:false,mehrPr:false,modus:"netto"}}

/* ---------- Dateien lesen ---------- */
function b64(s){const bin=atob(s.replace(/[^A-Za-z0-9+\/=]/g,""));const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u}
function qp(s){s=s.replace(/=\r?\n/g,"");const out=[];for(let i=0;i<s.length;i++){const c=s[i];if(c==="="&&/^[0-9A-Fa-f]{2}$/.test(s.substr(i+1,2))){out.push(parseInt(s.substr(i+1,2),16));i+=2}else{for(const b of new TextEncoder().encode(c))out.push(b)}}return new Uint8Array(out)}
function dec(bytes,cs){try{return new TextDecoder(cs).decode(bytes)}catch(e){return new TextDecoder("utf-8").decode(bytes)}}
function mw(s){return (s||"").replace(/=\?([\w-]+)\?([BbQq])\?([^?]*)\?=/g,(m,cs,enc,txt)=>{try{return enc.toUpperCase()==="B"?dec(b64(txt),cs):dec(qp(txt.replace(/_/g," ")),cs)}catch(e){return txt}})}
function splitHead(s){const m=s.match(/\r?\n\r?\n/);if(!m)return[s,""];return[s.slice(0,m.index),s.slice(m.index+m[0].length)]}
function hdrs(h){const o={};h.replace(/\r?\n[ \t]+/g," ").split(/\r?\n/).forEach(l=>{const k=l.indexOf(":");if(k>0)o[l.slice(0,k).toLowerCase()]=l.slice(k+1).trim()});return o}
function mime(s){
  const[h,b]=splitHead(s),H=hdrs(h),ct=(H["content-type"]||"text/plain").toLowerCase(),cte=(H["content-transfer-encoding"]||"7bit").toLowerCase(),res={texts:[],htmls:[],pdfs:[],head:H};
  const bm=(H["content-type"]||"").match(/boundary="?([^";\s]+)"?/i);
  if(ct.startsWith("multipart/")&&bm){b.split("--"+bm[1]).slice(1).forEach(p=>{if(/^--/.test(p))return;const r=mime(p.replace(/^\r?\n/,""));res.texts.push(...r.texts);res.htmls.push(...r.htmls);res.pdfs.push(...r.pdfs)});return res}
  const cs=(ct.match(/charset="?([\w-]+)/i)||[])[1]||"utf-8";
  let bytes;try{bytes=cte==="base64"?b64(b):cte==="quoted-printable"?qp(b):new TextEncoder().encode(b)}catch(e){return res}
  if(ct.includes("application/pdf")||(/\.pdf/i.test(H["content-disposition"]||H["content-type"]||"")&&cte==="base64")){res.pdfs.push(bytes);return res}
  if(ct.startsWith("text/html"))res.htmls.push(dec(bytes,cs));else if(ct.startsWith("text/"))res.texts.push(dec(bytes,cs));
  return res}
function htmlText(h){const d=new DOMParser().parseFromString(h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi,"").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi,"\n").replace(/<\/t[dh]>/gi," "),"text/html");return d.body?d.body.textContent:""}
function ladePdfJs(){return new Promise((ok,err)=>{if(window.pdfjsLib)return ok();const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";ok()};s.onerror=()=>err(new Error("PDF-Bibliothek nicht ladbar (Internetverbindung?)"));document.head.appendChild(s)})}
async function pdfText(buf){
  await ladePdfJs();const pdf=await pdfjsLib.getDocument({data:buf}).promise;let txt="";
  for(let p=1;p<=pdf.numPages;p++){const pg=await pdf.getPage(p),c=await pg.getTextContent();let y=null;
    for(const it of c.items){const yy=it.transform[5];if(y!==null&&Math.abs(yy-y)>2)txt+="\n";else if(txt&&!txt.endsWith("\n"))txt+=" ";txt+=it.str;y=yy}txt+="\n"}
  return txt}
function msgText(buf){const u=new Uint8Array(buf);const a=new TextDecoder("utf-16le").decode(u),b=new TextDecoder("windows-1252").decode(u);
  const re=/[\x20-\x7EÀ-ſ€\n\r\t]{30,}/g;return [...(a.match(re)||[]),...(b.match(re)||[])].join("\n")}
async function readFile(f){
  const n=f.name.toLowerCase(),buf=await f.arrayBuffer();
  if(n.endsWith(".pdf"))return{text:await pdfText(buf),info:"PDF"};
  if(n.endsWith(".eml")){
    let s=new TextDecoder("utf-8").decode(buf);if((s.match(/�/g)||[]).length>3)s=new TextDecoder("windows-1252").decode(buf);
    const r=mime(s),H=r.head;const body=r.texts.join("\n").trim()||r.htmls.map(htmlText).join("\n");
    let text="Betreff: "+mw(H.subject||"")+"\n\n"+body;
    for(const p of r.pdfs){try{text+="\n\n"+await pdfText(p.buffer)}catch(e){text+="\n(PDF-Anhang nicht lesbar: "+e.message+")"}}
    const from=mw(H.from||"");const nm=(from.match(/^\s*"?([^"<]+?)"?\s*</)||[])[1];
    return{text,info:"E-Mail"+(r.pdfs.length?" + "+r.pdfs.length+" PDF-Anhang":""),from:nm||(from.match(/@([\w.-]+)/)||[])[1]}}
  if(n.endsWith(".msg"))return{text:msgText(buf),info:"MSG (grob gelesen – als .eml speichern liest genauer)"};
  if(/\.(png|jpe?g|gif|webp|bmp|heic)$/.test(n))throw new Error("Bilder und Screenshots kann der Reiter noch nicht lesen. Bitte Text kopieren oder PDF verwenden.");
  const s=new TextDecoder("utf-8").decode(buf);
  return{text:/\.html?$/.test(n)?htmlText(s):s,info:"Text"}}

/* ---------- Eingabe -> Felder ---------- */
function num(v){let s=String(v==null?"":v).trim().replace(/[€\s]/g,"");if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))s=s.replace(/\./g,"");s=s.replace(",",".");return parseFloat(s)||0}
function calcPrice(){const p=num(V.preis),art=V.preisart||"netto",diff=V.steuer==="Differenzbesteuert";let netto,brutto,note="";
  if(art==="netto"){netto=p;brutto=Math.round(p*1.19)}else{brutto=p;netto=diff?p:Math.round(p/1.19);if(diff)note=" (Differenzbesteuerung: kein Vorsteuerabzug, Brutto = Netto)"}
  return{netto,brutto,note}}
function kmNum(){return parseInt(String(V.km||"").replace(/\D/g,""))||0}
function psNum(){const m=String(V.leistung||"").match(/(\d+)\s*PS/);return m?+m[1]:0}
function ezJahr(){const m=String(V.ez||"").match(/(\d{4})/);return m?+m[1]:0}
function ref(){const pr=calcPrice();return{name:[V.hersteller,V.modell,V.typ].filter(Boolean).join(" ")||"Fahrzeug",ez:V.ez||"–",km:kmNum(),linie:V.linie||"–",felgen:V.felgen||"?",anbieter:V.anbieter||"Eigenes Angebot",netto:pr.netto,brutto:pr.brutto}}
function renderForm(){
  $("vg-form").innerHTML=FIELDS.map(([g,fs])=>`<div class="vg-grp"><h3>${g}</h3><div class="vg-grid">`+fs.map(([k,l,x])=>{
    const c=CONF[k]||(V[k]?"man":"leer");
    const inp=x&&x.startsWith("sel:")?`<select data-k="${k}">${x.slice(4).split("|").map((o,ix)=>`<option value="${ix===0&&k==="steuer"?"":E(o)}"${(o===V[k]||(!V[k]&&ix===0))?" selected":""}>${E(o)}</option>`).join("")}</select>`:`<input type="text" data-k="${k}" value="${E(V[k]||"")}" title="${E(SRC[k]||"")}">`;
    return`<div class="vg-fld ${c} ${x==="w2"?"w2":""}"><label>${l}</label>${inp}</div>`}).join("")+`</div></div>`).join("");
  document.querySelectorAll("#vg-form [data-k]").forEach(elm=>{const h=()=>{const k=elm.dataset.k;V[k]=elm.value;CONF[k]=elm.value?"man":"leer";const f=elm.closest(".vg-fld");f.className="vg-fld "+CONF[k]+(f.classList.contains("w2")?" w2":"");renderErgebnis()};elm.addEventListener("input",h);elm.addEventListener("change",h)});
}
function renderEq(){
  const pill=([k])=>`<span class="vg-pill ${REFEQ[k]===J?"ja":REFEQ[k]===N?"nein":"unb"}" data-k="${k}" title="${LANG[k]}">${REFEQ[k]===J?"✔":REFEQ[k]===N?"✘":"?"} ${LANG[k]}</span>`;
  $("vg-eq").innerHTML=`<div class="vg-eqh">Stufe 1 – wichtigste</div>`+FEAT1.map(pill).join("")+`<div class="vg-eqh">Stufe 2 – weitere</div>`+FEAT2.map(pill).join("");
  document.querySelectorAll("#vg-eq .vg-pill").forEach(p=>p.onclick=()=>{const k=p.dataset.k;REFEQ[k]=REFEQ[k]===J?N:REFEQ[k]===N?U:J;renderEq();renderErgebnis()});
}
function renderProt(r){
  const rows=ALLKEYS.filter(k=>r.felder[k]).map(k=>`<tr><td>${LABEL[k]}</td><td><b>${E(r.felder[k].v)}</b></td><td>${r.felder[k].c==="ok"?"sicher":"unsicher"}</td><td>${E(r.felder[k].src||"")}</td></tr>`).join("");
  $("vg-prot").innerHTML=`<table class="vg-prot"><tr><th>Feld</th><th>Wert</th><th>Sicherheit</th><th>Fundstelle im Text</th></tr>${rows}</table><div class="vg-foot">Ausstattung: ${FEAT.map(([k,n])=>n+": "+(r.eq[k]===J?"✔":r.eq[k]===N?"✘":"?")).join(" · ")}</div>`;
}
function setStatus(html){$("vg-status").innerHTML=html}
function applyParsed(r,info){
  V={};CONF={};SRC={};
  ALLKEYS.forEach(k=>{if(r.felder[k]){V[k]=r.felder[k].v;CONF[k]=r.felder[k].c;SRC[k]=r.felder[k].src}});
  const L=$("vg-link").value.trim();if(L&&!V.link){V.link=L;CONF.link="ok"}
  REFEQ=Object.assign({},r.eq);FIL=neuFilter();ROWS=[];ROWKEY="";
  const n=ALLKEYS.filter(k=>V[k]).length,u=ALLKEYS.filter(k=>CONF[k]==="unsicher").length,opt=["steuer","hubraum","sitze","aufbau","link","verf","standort","anbieter","innen","farbe","felgen"];
  const fehlt=ALLKEYS.filter(k=>!V[k]&&!opt.includes(k));
  setStatus(n?`<span class="vg-ok">✓ ${n} von ${ALLKEYS.length} Feldern erkannt${info?" ("+E(info)+")":""}</span>${u?` · <span class="vg-warn">${u} unsicher – bitte prüfen</span>`:""}${fehlt.length?` · fehlt: ${fehlt.map(k=>LABEL[k]).join(", ")}`:""}${r.hinweise.length?`<br><span class="vg-warn">${r.hinweise.map(E).join(" ")}</span>`:""}`:`<span class="vg-warn">Keine Fahrzeugdaten erkannt. Bitte Text prüfen oder Felder von Hand ausfüllen.</span>`);
  renderForm();renderEq();renderProt(r);renderVar(r);suchen();
}
function renderVar(r){
  const box=$("vg-var");
  if(!r.varianten||r.varianten.length<2){box.innerHTML="";return}
  box.innerHTML=`<div class="vg-vh">Varianten im Text – Klick wählt die Variante für den Vergleich:</div>`+r.varianten.map((v,i)=>`<button class="vg-var ${i===r.aktiv?"on":""}" data-i="${i}"><b>${i+1}.</b> ${E(v.titel)} <span class="p">${E(v.preis.replace(/^.*?(\d)/,"$1"))}</span></button>`).join("");
  box.querySelectorAll(".vg-var").forEach(b=>b.onclick=()=>{const i=+b.dataset.i;applyParsed(parseVariante($("vg-raw").value+($("vg-link").value?"\n"+$("vg-link").value:""),i,META),"Variante "+(i+1))});
}
function run(info){applyParsed(parseVehicle($("vg-raw").value+($("vg-link").value?"\n"+$("vg-link").value:""),META),info)}
async function handleFiles(files){
  const infos=[];let add="";META={};
  for(const f of files){
    setStatus("Lese "+E(f.name)+" …");
    try{const r=await readFile(f);add+="\n\n———— "+f.name+" ————\n"+r.text;infos.push(r.info);if(r.from)META.from=r.from}
    catch(e){setStatus(`<span class="vg-warn">${E(f.name)}: ${E(e.message)}</span>`);return}
  }
  $("vg-raw").value=add.trim();run(infos.join(", "));
}

/* ---------- Daten holen ---------- */
async function suchen(){
  if(!V.hersteller||!V.modell){ROWS=[];ROWKEY="";renderErgebnis();return}
  const key=(V.hersteller+"|"+V.modell).toLowerCase();
  if(key===ROWKEY&&ROWS.length){renderErgebnis();return}
  if(loading)return;loading=true;$("vg-load").textContent="Angebote werden geladen …";
  try{
    const r=await db.rpc("angebotsvergleich",{p_hersteller:V.hersteller,p_modell:V.modell,p_limit:1000});
    if(r.error)throw r.error;
    ROWS=(r.data||[]).map(normRow);ROWKEY=key;FIL=neuFilter();standardFilter();
    $("vg-load").textContent=ROWS.length+" Angebote zu "+V.hersteller+" "+V.modell+" geladen.";
  }catch(e){ROWS=[];ROWKEY="";$("vg-load").innerHTML=`<span class="vg-warn">Angebote nicht abrufbar: ${E(e.message||e)}${/Berechtigung/.test(e.message||"")?" – dein Konto braucht die Rolle Admin oder Verkauf.":""}</span>`}
  loading=false;renderErgebnis();
}
function normRow(r){const eq={};FEAT.forEach(([k])=>{eq[k]=r["e_"+k]==null?U:Number(r["e_"+k])});
  return{id:r.id,quelle:r.quelle||"?",anbieter:r.anbieter||"",typ:r.typ||"",linie:r.linie||"",aufbau:aufbauAus((r.typ||"")+" "+(r.modell||"")),ez:r.erstzulassung||null,km:r.km_stand==null?null:Number(r.km_stand),ps:r.ps==null?null:Number(r.ps),farbe:r.farbe||"",kraft:r.kraftstoff||"",getr:r.getriebe||"",netto:Number(r.preis_netto)||0,brutto:r.preis_brutto==null?null:Number(r.preis_brutto),
    verf:r.verfuegbarkeit||"",lieferzeit:r.lieferzeit_tage,paket:!!r.paketangebot,mind:r.mindestabnahme,link:r.original_link||"",vin:r.vin||"",alter:r.alter_stunden==null?null:Number(r.alter_stunden),felgen:r.felgen||"",eq,mein:false}}
function kraftGruppe(k){k=String(k||"");if(/plug/i.test(k))return["Plug-in-Hybrid"];if(/mild/i.test(k))return["Benzin","Mild-Hybrid"];if(/hybrid/i.test(k))return["Hybrid"];if(/diesel/i.test(k))return["Diesel"];if(/elektro/i.test(k))return["Elektro"];if(/benzin/i.test(k))return["Benzin"];return[]}
function getrGruppe(g){g=String(g||"");return /automatik/i.test(g)?["Automatik"]:/schalt/i.test(g)?["Schaltgetriebe"]:[]}
function standardFilter(){
  const kr=[...new Set(ROWS.flatMap(r=>r.kraft.split(/,\s*/)).filter(Boolean))],ge=[...new Set(ROWS.map(r=>r.getr).filter(Boolean))];
  const wk=kraftGruppe(V.kraft).filter(x=>kr.includes(x)),wg=getrGruppe(V.getr).filter(x=>ge.includes(x));
  FIL.kraft=new Set(wk.length?wk:kr);FIL.getr=new Set(wg.length?wg:ge);
  const li=[...new Set(ROWS.map(r=>r.linie).filter(Boolean))],nl=x=>String(x||"").toLowerCase().replace(/[\s-]+/g,"").replace(/plus$/,"+"),mi=li.filter(x=>nl(x)===nl(V.linie));
  FIL.linie=new Set(mi.length?mi:li);FIL.linieUnb=true;
  const au=[...new Set(ROWS.flatMap(r=>r.aufbau))],vau=aufbauAus(V.aufbau||"").filter(x=>au.includes(x));
  FIL.aufbau=new Set(vau.length?vau:au);FIL.aufbauUnb=true;
  const j=ezJahr();FIL.ezAb=j?j-1:null;const km=kmNum();FIL.kmBis=km||V.km?Math.ceil((km+15000)/5000)*5000:null;FIL.ps=psNum()>0;
}
function preis(r){return FIL.modus==="brutto"?Math.round(r.netto*1.19):FIL.modus==="fracht"?r.netto+FRACHT:r.netto}
function gleichOderBesser(r){return (FIL.mehrPr?FEAT:FEAT1).every(([k])=>REFEQ[k]!==J||r.eq[k]!==N)}
const score=r=>FEAT1.filter(([k])=>r.eq[k]===J).length,score2=r=>FEAT2.filter(([k])=>r.eq[k]===J).length,unklar=r=>FEAT1.filter(([k])=>r.eq[k]===U).length;
function passt(r){
  if(FIL.kraft&&FIL.kraft.size&&r.kraft&&!r.kraft.split(/,\s*/).some(x=>FIL.kraft.has(x)))return false;
  if(FIL.getr&&FIL.getr.size&&r.getr&&!FIL.getr.has(r.getr))return false;
  if(FIL.linie){if(r.linie){if(!FIL.linie.has(r.linie))return false}else if(!FIL.linieUnb)return false}
  if(FIL.aufbau&&FIL.aufbau.size){if(r.aufbau&&r.aufbau.length){if(!r.aufbau.some(x=>FIL.aufbau.has(x)))return false}else if(!FIL.aufbauUnb)return false}
  if(FIL.ezAb&&r.ez&&+String(r.ez).slice(0,4)<FIL.ezAb)return false;
  if(FIL.kmBis&&r.km!=null&&r.km>FIL.kmBis)return false;
  if(FIL.ps&&psNum()>0&&r.ps&&Math.abs(r.ps-psNum())>psNum()*0.15)return false;
  if(FIL.gleich&&!gleichOderBesser(r))return false;if(FIL.pano&&r.eq.pano!==J)return false;if(FIL.sicher&&unklar(r)>0)return false;if(FIL.aktuell&&(r.alter==null||r.alter>24))return false;
  return true}
const ezText=ez=>{if(!ez)return"–";const m=String(ez).match(/^(\d{4})-(\d{2})/);return m?m[2]+"/"+m[1]:E(ez)};

/* ---------- Anzeige ---------- */
function chipsAus(id,werte,sel,key){$(id).innerHTML=werte.map(w=>`<span class="vg-chip ${sel.has(w)?"on":""}" data-w="${E(w)}">${E(w)}</span>`).join("");
  $(id).querySelectorAll(".vg-chip").forEach(c=>c.onclick=()=>{const w=c.dataset.w;if(FIL[key].has(w))FIL[key].delete(w);else FIL[key].add(w);renderErgebnis()})}
function renderErgebnis(){
  const R=ref(),pr=calcPrice();
  $("vg-derived").innerHTML=R.netto?`Netto <b>${eur(R.netto)}</b> · Brutto <b>${eur(R.brutto)}</b>${E(pr.note)}`:"Preis fehlt – bitte eintragen.";
  if(!ROWS.length||!R.netto){
    $("vg-verdict").innerHTML=`<div class="vg-kpi"><div class="z">–</div><div class="t">${!R.netto?"Ohne Preis kein Vergleich.":!V.hersteller||!V.modell?"Hersteller und Modell fehlen.":"Keine Angebote zu diesem Modell gefunden."}</div></div>`;
    $("vg-thead").innerHTML="";$("vg-tbody").innerHTML="";$("vg-cnt").textContent="";$("vg-fkraft").innerHTML="";$("vg-fgetr").innerHTML="";$("vg-flinie").innerHTML="";$("vg-faufbau").innerHTML="";$("vg-zaufbau").style.display="none";renderStand();renderSnap();return}
  const kr=[...new Set(ROWS.flatMap(r=>r.kraft.split(/,\s*/)).filter(Boolean))].sort(),ge=[...new Set(ROWS.map(r=>r.getr).filter(Boolean))].sort();
  chipsAus("vg-fkraft",kr,FIL.kraft,"kraft");chipsAus("vg-fgetr",ge,FIL.getr,"getr");
  const li=[...new Set(ROWS.map(r=>r.linie).filter(Boolean))].sort(),nU=ROWS.filter(r=>!r.linie).length;
  if(FIL.linie)chipsAus("vg-flinie",li,FIL.linie,"linie");$("vg-flinieun").classList.toggle("on",!!FIL.linieUnb);$("vg-flinieun").textContent="Linie unbekannt ("+nU+")";
  const au=[...new Set(ROWS.flatMap(r=>r.aufbau))].sort(),nUA=ROWS.filter(r=>!r.aufbau.length).length,hatAuf=au.length>0||aufbauAus(V.aufbau||"").length>0;
  $("vg-zaufbau").style.display=hatAuf?"":"none";
  if(FIL.aufbau)chipsAus("vg-faufbau",au,FIL.aufbau,"aufbau");$("vg-faufbauun").classList.toggle("on",!!FIL.aufbauUnb);$("vg-faufbauun").textContent="Aufbau unbekannt ("+nUA+")";
  if($("vg-ez")!==document.activeElement)$("vg-ez").value=FIL.ezAb||"";if($("vg-km")!==document.activeElement)$("vg-km").value=FIL.kmBis||"";
  [["vg-fps","ps"],["vg-fgleich","gleich"],["vg-fpano","pano"],["vg-fsicher","sicher"],["vg-faktuell","aktuell"],["vg-fmehr","mehr"],["vg-fmehrpr","mehrPr"]].forEach(([id,k])=>$(id).classList.toggle("on",!!FIL[k]));
  $("vg-fps").style.display=psNum()>0?"":"none";
  document.querySelectorAll("#vg-modus button").forEach(b=>b.classList.toggle("on",b.dataset.m===FIL.modus));
  const mein={id:"mein",quelle:"DEIN ANGEBOT",anbieter:R.anbieter,netto:R.netto,ez:null,ezT:R.ez,km:R.km,ps:psNum()||null,typ:V.typ||"",linie:R.linie,aufbau:aufbauAus(V.aufbau||""),eq:REFEQ,felgen:R.felgen,verf:V.verf||"–",alter:0,link:V.link||"",farbe:V.farbe||"",vin:V.fin||"",mein:true};
  const alle=ROWS.concat([mein]),liste=alle.filter(r=>r.mein||passt(r));
  liste.sort((a,b)=>{const g=r=>sortKey==="preis"?preis(r):sortKey==="km"?(r.km==null?1e9:r.km):sortKey==="score"?-score(r):sortKey==="ez"?String(r.ez||"0"):String(r[sortKey]||"");const va=g(a),vb=g(b);return(va>vb?1:va<vb?-1:0)*sortDir});
  const ps=[...liste].sort((a,b)=>preis(a)-preis(b)),platz=ps.findIndex(r=>r.mein)+1,min=ps[0],n=ps.length,oM=ps.filter(r=>!r.mein),med=oM.length?oM.map(preis).sort((a,b)=>a-b)[Math.floor(oM.length/2)]:0;
  const gl=ps.filter(r=>r.mein||gleichOderBesser(r)),platzG=gl.findIndex(r=>r.mein)+1,dMin=preis(mein)-preis(min),dMed=preis(mein)-med,lab=FIL.modus==="brutto"?"Brutto":FIL.modus==="fracht"?"Netto + Fracht":"Netto";
  $("vg-verdict").innerHTML=
    `<div class="vg-kpi ${platz<=3?"gut":platz>n/2?"schlecht":""}"><div class="z">Platz ${platz} von ${n}</div><div class="t">im aktuellen Filter, nach ${lab}</div></div>`+
    `<div class="vg-kpi ${platzG<=2?"gut":""}"><div class="z">Platz ${platzG} von ${gl.length}</div><div class="t">nur Angebote mit gleicher oder besserer Ausstattung</div></div>`+
    `<div class="vg-kpi ${dMin<=0?"gut":"schlecht"}"><div class="z">${dMin<=0?"günstigstes":"+ "+eur(dMin)}</div><div class="t">gegenüber dem günstigsten (${min.mein?"du selbst":E(min.quelle)})</div></div>`+
    `<div class="vg-kpi ${dMed<=0?"gut":"schlecht"}"><div class="z">${dMed<=0?"− "+eur(-dMed):"+ "+eur(dMed)}</div><div class="t">gegenüber dem Median (${eur(med)})</div></div>`;
  const fcols=FIL.mehr?FEAT:FEAT1,cols=[["#",""],["Quelle","quelle"],["Anbieter","anbieter"],[lab,"preis"],["Δ zu dir",""],["EZ","ez"],["km","km"],["Typ","typ"],["Linie","linie"]].concat(hatAuf?[["Aufbau",""]]:[]).concat(fcols.map(f=>[f[1],""])).concat([["Felgen",""],["Ausst.","score"],["Verfügbar",""]]);
  $("vg-thead").innerHTML=cols.map(([t,k])=>`<th ${k?`data-k="${k}"`:""} class="${FEAT.some(f=>f[1]===t)?"c":""}">${E(t)}${k===sortKey?(sortDir>0?" ▲":" ▼"):""}</th>`).join("");
  $("vg-tbody").innerHTML=liste.map(r=>{
    const rang=ps.findIndex(x=>x.id===r.id)+1,d=preis(r)-preis(mein),dl=r.mein?"–":`<span class="vg-delta ${d<0?"minus":"plus"}">${d<0?"−":"+"} ${eur(Math.abs(d))}</span>`;
    const tr=`<tr class="vg-row ${r.mein?"mein":""}" data-id="${E(r.id)}"><td>${rang}</td><td>${E(r.quelle)}</td><td>${E(r.anbieter)}</td><td class="num">${eur(preis(r))}</td><td class="num">${dl}</td><td>${r.mein?E(r.ezT):ezText(r.ez)}</td><td class="num">${r.km==null?"–":r.km.toLocaleString("de-DE")}</td><td class="typ">${E(r.typ)}</td><td>${E(r.linie)}</td>`+(hatAuf?`<td>${E((r.aufbau||[]).join(" + "))}</td>`:"")+fcols.map(([k])=>`<td class="c">${sym(r.eq[k])}</td>`).join("")+`<td>${E(r.felgen||"?")}</td><td class="c">${score(r)}/${FEAT1.length}${score2(r)?` <span class="vg-ja">+${score2(r)}</span>`:""}${unklar(r)?` <span class="vg-unb">(${unklar(r)}?)</span>`:""}</td><td>${E(r.verf)}</td></tr>`;
    const url=/^https?:\/\//i.test(r.link||"")?E(r.link):"";
    const det=String(openId)===String(r.id)?`<tr class="vg-detail"><td colspan="${cols.length}"><b>${E(r.quelle)} · ${E(r.anbieter)}</b> — ${E(r.typ)}${r.farbe?" · "+E(r.farbe):""}${r.vin?" · FIN "+E(r.vin):""}. Fracht-Aufschlag ${eur(FRACHT)}${r.lieferzeit!=null?", Lieferzeit "+E(r.lieferzeit)+" Tage":""}${r.paket?", Paketangebot"+(r.mind?" (ab "+E(r.mind)+" Stück)":""):""}. Datenstand: ${r.alter===0?"–":r.alter==null?"unbekannt":"vor "+E(r.alter)+" Std."}. ${url?`<a href="${url}" target="_blank" rel="noopener">Originalangebot öffnen</a>`:""}</td></tr>`:"";
    return tr+det}).join("");
  $("vg-cnt").textContent=(liste.length-1)+" von "+ROWS.length+" Angeboten im Filter";
  document.querySelectorAll("#vg-thead th[data-k]").forEach(th=>th.onclick=()=>{const k=th.dataset.k;if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=1}renderErgebnis()});
  document.querySelectorAll("#vg-tbody tr.vg-row").forEach(tr=>tr.onclick=()=>{openId=String(openId)===tr.dataset.id?null:tr.dataset.id;renderErgebnis()});
  renderStand();renderSnap();
}
function renderStand(){
  $("vg-stand").innerHTML=QUELLEN.length?QUELLEN.map(s=>{const cls=s.status==="OK"?"ok":s.status==="Fehler"?"rot":s.status==="Warnung"?"warn":"pause";
    const when=s.status==="Pausiert"?"stillgelegt":s.letzter_pull?new Date(s.letzter_pull).toLocaleDateString("de-DE"):"–";
    return`<span class="vg-q ${cls}" title="${E(s.status+(s.fehlermeldung?" – "+s.fehlermeldung:""))}"><i></i>${E(s.quelle)} <span class="m">${when}</span></span>`}).join(""):"Quellenstand nicht abrufbar.";
}
async function ladeStand(){
  try{const q=await db.from("quellen_log").select("quelle,status,letzter_pull,fehlermeldung").order("quelle");if(!q.error)QUELLEN=q.data||[]}catch(e){}
  try{const p=await db.from("kalkulation_parameter").select("schluessel,wert").eq("schluessel","fracht");if(!p.error&&p.data&&p.data[0]&&Number(p.data[0].wert)>0)FRACHT=Number(p.data[0].wert)}catch(e){}
  renderStand();
}

/* ---------- Fahrzeugvergleich-App (lose gekoppelt: gleicher Login, Tabelle fv_comparisons) ---------- */
async function appLaden(){
  const box=$("vg-app");box.style.display="block";box.innerHTML="Lade deine Vergleiche …";
  try{
    const c=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{db:{schema:"public"}});
    const r=await c.from("fv_comparisons").select("id,name,data").order("updated_at",{ascending:false});
    if(r.error)throw r.error;const opts=[];
    (r.data||[]).forEach(cp=>((cp.data&&cp.data.vehicles)||[]).forEach((v,i)=>opts.push({cp:cp.id,i,t:(cp.name||"Vergleich")+" – "+(v.name||"Fahrzeug "+(i+1))})));
    window.__vgApp=r.data||[];
    box.innerHTML=opts.length?`<select id="vg-app-sel">${opts.map((o,k)=>`<option value="${k}">${E(o.t)}</option>`).join("")}</select> <button class="vg-btn primary" id="vg-app-go">Übernehmen</button>`:"Keine gespeicherten Fahrzeuge in der Fahrzeugvergleich-App gefunden.";
    window.__vgOpts=opts;
    if(opts.length)$("vg-app-go").onclick=()=>appUebernehmen(opts[+$("vg-app-sel").value]);
  }catch(e){box.innerHTML=`<span class="vg-warn">Fahrzeugvergleich-App nicht abrufbar: ${E(e.message||e)}</span>`}
}
function appUebernehmen(o){
  const cp=(window.__vgApp||[]).find(x=>x.id===o.cp),v=cp&&cp.data.vehicles[o.i];if(!v)return;
  const f=v.fields||{},txt=[];
  const m={"Hersteller":"hersteller","Modell":"modell","Typ / Variante":"typ","Kilometerstand":"km","Hubraum":"hubraum","Sitzplätze":"sitze","Getriebe":"getr","Antrieb":"antrieb","Kraftstoff":"kraft","Außenfarbe":"farbe","Innenausstattung":"innen"};
  const out={felder:{},eq:{},hinweise:[]};
  const put=(k,val,c)=>{if(val&&String(val).trim()&&String(val)!=="k. A.")out.felder[k]={v:String(val).trim(),c:c||"ok",src:"aus Fahrzeugvergleich-App"}};
  Object.keys(m).forEach(lab=>put(m[lab],f[lab]));
  const ez=String(f["Erstzulassung"]||"").match(/(\d{1,2})[./](\d{4})|(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if(ez)put("ez",ez[5]?String(ez[4]).padStart(2,"0")+"/"+ez[5]:String(ez[1]).padStart(2,"0")+"/"+ez[2]);
  const l=String(f["Leistung"]||"").match(/(\d+)\s*kW(?:\s*\((\d+)\s*PS\))?/);if(l)put("leistung",l[1]+" kW ("+(l[2]||Math.round(+l[1]*1.35962))+" PS)",l[2]?"ok":"unsicher");
  const c=v.calc||{};if(c.ekn)put("preis",Math.round(c.ekn));if(c.ekn)put("preisart","netto");
  if(v.source)put("link",v.source);
  const t=Object.keys(f).map(k=>k+": "+f[k]).join("\n")+"\n"+Object.entries(v.equip||{}).filter(e=>e[1]).map(e=>e[0]).join(", ");
  out.eq=parseVehicle(t,{}).eq;
  $("vg-raw").value="(aus der Fahrzeugvergleich-App übernommen: "+(v.name||"")+")";
  applyParsed(out,"Fahrzeugvergleich-App");
}

/* ---------- Gespeicherte Vergleiche (Tabelle ankauf.vergleiche, Team-Ablage fuer Admin und Verkauf) ---------- */
const VG_FELDER=["hersteller","modell","typ","aufbau","linie","zustand","ez","km","leistung","hubraum","sitze","kraft","getr","antrieb","farbe","innen","felgen","preis","preisart","steuer","anbieter","standort","verf","link"];
function snapRow(r){return{id:r.id,quelle:r.quelle,anbieter:r.anbieter,typ:r.typ,linie:r.linie,ez:r.ez,km:r.km,ps:r.ps,kraft:r.kraft,getr:r.getr,netto:r.netto,verf:r.verf,link:r.link,alter:r.alter,eq:r.eq}}
function vgName(){const R=ref();return R.name+" – "+new Date().toLocaleDateString("de-DE")}
async function vgSpeichern(){
  const msg=$("vg-smsg"),R=ref();
  if(!ROWS.length||!R.netto){msg.innerHTML=`<span class="vg-warn">Erst Fahrzeug einlesen und Angebote laden – leere Vergleiche werden nicht gespeichert.</span>`;return}
  const name=($("vg-sname").value||"").trim()||vgName();
  const vorgaben={felder:Object.fromEntries(VG_FELDER.filter(k=>V[k]).map(k=>[k,V[k]])),eq:REFEQ,fil:Object.assign({},FIL,{kraft:[...(FIL.kraft||[])],getr:[...(FIL.getr||[])],linie:FIL.linie?[...FIL.linie]:null,aufbau:FIL.aufbau?[...FIL.aufbau]:null})};
  const rows=ROWS.filter(passt).map(snapRow),netto=rows.map(r=>r.netto).filter(Boolean).sort((a,b)=>a-b);
  const mom={stand:new Date().toISOString(),dein_netto:R.netto,modus:FIL.modus,fracht:FRACHT,guenstigster:netto[0]||null,rows};
  msg.textContent="Speichere …";
  try{
    const r=await db.from("vergleiche").insert({name,vorgaben,momentaufnahme:mom,anzahl:rows.length});
    if(r.error)throw r.error;
    msg.innerHTML=`<span class="vg-ok">✓ Gespeichert: ${E(name)} (${rows.length} Angebote)</span>`;$("vg-sname").value="";vgListe();
  }catch(e){msg.innerHTML=`<span class="vg-warn">Nicht gespeichert: ${E(e.message||e)}</span>`}
}
async function vgListe(){
  const box=$("vg-liste");if(!box)return;
  try{
    const r=await db.from("vergleiche").select("id,name,erstellt_von_mail,erstellt_am,anzahl").order("erstellt_am",{ascending:false}).limit(100);
    if(r.error)throw r.error;
    box.innerHTML=(r.data||[]).length?`<table class="vg-prot"><tr><th>Name</th><th>Gespeichert</th><th>von</th><th>Angebote</th><th></th></tr>`+r.data.map(v=>`<tr><td><b>${E(v.name)}</b></td><td>${new Date(v.erstellt_am).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})}</td><td>${E(String(v.erstellt_von_mail||"").split("@")[0])}</td><td>${v.anzahl}</td><td style="white-space:nowrap"><button class="vg-btn" data-open="${E(v.id)}">Öffnen</button> <button class="vg-btn" data-del="${E(v.id)}">Löschen</button></td></tr>`).join("")+`</table>`:"Noch keine Vergleiche gespeichert.";
    box.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>vgOeffnen(b.dataset.open));
    box.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{if(b.dataset.sure){vgLoeschen(b.dataset.del);return}b.dataset.sure="1";b.textContent="Wirklich löschen?";b.classList.add("primary");setTimeout(()=>{b.dataset.sure="";b.textContent="Löschen";b.classList.remove("primary")},4000)});
  }catch(e){box.innerHTML=`<span class="vg-warn">Gespeicherte Vergleiche nicht abrufbar: ${E(e.message||e)}</span>`}
}
async function vgLoeschen(id){
  try{const r=await db.from("vergleiche").delete().eq("id",id).select("id");if(r.error)throw r.error;
    $("vg-smsg").innerHTML=(r.data||[]).length?`<span class="vg-ok">✓ Gelöscht.</span>`:`<span class="vg-warn">Nicht gelöscht – nur der Ersteller oder ein Admin darf das.</span>`;
  }catch(e){$("vg-smsg").innerHTML=`<span class="vg-warn">Nicht gelöscht: ${E(e.message||e)}</span>`}
  vgListe();
}
async function vgOeffnen(id){
  const msg=$("vg-smsg");msg.textContent="Öffne …";
  try{
    const r=await db.from("vergleiche").select("name,erstellt_am,vorgaben,momentaufnahme").eq("id",id).single();
    if(r.error)throw r.error;const v=r.data,f=v.vorgaben||{};
    V={};CONF={};SRC={};META={};ROWS=[];ROWKEY="";
    Object.entries(f.felder||{}).forEach(([k,x])=>{V[k]=x;CONF[k]="man"});
    REFEQ=Object.assign({},f.eq||{});$("vg-raw").value="(aus gespeichertem Vergleich geöffnet: "+v.name+")";$("vg-link").value="";$("vg-var").innerHTML="";$("vg-prot").innerHTML="";
    SNAP={name:v.name,stand:v.momentaufnahme.stand,m:v.momentaufnahme};
    setStatus(`<span class="vg-ok">✓ Vergleich „${E(v.name)}“ geöffnet – Stand ${new Date(SNAP.stand).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})}</span>`);
    renderForm();renderEq();await suchen();
    const s=f.fil||{};Object.assign(FIL,s,{kraft:new Set(s.kraft||[]),getr:new Set(s.getr||[]),linie:s.linie?new Set(s.linie):FIL.linie,aufbau:s.aufbau?new Set(s.aufbau):FIL.aufbau});
    renderErgebnis();msg.innerHTML="";$("vg-snap").scrollIntoView({behavior:"smooth"});
  }catch(e){msg.innerHTML=`<span class="vg-warn">Nicht geöffnet: ${E(e.message||e)}</span>`}
}
function renderSnap(){
  const box=$("vg-snap");if(!box)return;
  if(!SNAP){box.innerHTML="";return}
  const m=SNAP.m,alt=m.rows||[],jetzt=ROWS,byId=a=>new Map(a.map(r=>[String(r.id),r])),A=byId(alt),B=byId(jetzt),
    neu=jetzt.filter(r=>!A.has(String(r.id))&&passt(r)),weg=alt.filter(r=>!B.has(String(r.id))),
    chg=alt.filter(r=>B.has(String(r.id))&&B.get(String(r.id)).netto!==r.netto).map(r=>({a:r,n:B.get(String(r.id))}));
  const zeile=(r,x)=>`<tr><td>${E(r.quelle)}</td><td>${E(r.anbieter)}</td><td class="typ">${E(r.typ)}</td><td>${ezText(r.ez)}</td><td class="num">${r.km==null?"–":r.km.toLocaleString("de-DE")}</td><td class="num">${x}</td></tr>`;
  const tab=(rows,f)=>rows.length?`<table class="vg-prot"><tr><th>Quelle</th><th>Anbieter</th><th>Typ</th><th>EZ</th><th>km</th><th>Preis netto</th></tr>${rows.sort((a,b)=>(a.netto||a.a.netto)-(b.netto||b.a.netto)).slice(0,50).map(f).join("")}</table>${rows.length>50?`<div class="vg-foot">… und ${rows.length-50} weitere</div>`:""}`:`<div class="vg-foot">keine</div>`;
  const ROWKEY_OK=ROWS.length>0;
  box.innerHTML=`<h3 class="vg-vh">Gespeicherter Stand: ${E(SNAP.name)} (${new Date(SNAP.stand).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})})</h3>
  <div class="vg-foot" style="margin:0 0 8px">Damals: ${alt.length} Angebote im Filter${m.guenstigster?`, günstigstes ${eur(m.guenstigster)} netto`:""}, dein Angebot ${eur(m.dein_netto)} netto.${ROWKEY_OK?` Heute: ${jetzt.filter(passt).length} Angebote im Filter.`:" Heutige Angebote werden geladen …"}</div>
  ${ROWKEY_OK?`<div class="vg-verdict"><div class="vg-kpi"><div class="z">${neu.length}</div><div class="t">neu seit dem Speichern</div></div><div class="vg-kpi"><div class="z">${weg.length}</div><div class="t">nicht mehr im Bestand</div></div><div class="vg-kpi"><div class="z">${chg.length}</div><div class="t">mit geändertem Preis</div></div></div>
  <details style="margin-top:8px"><summary class="vg-vh" style="cursor:pointer">Neu (${neu.length})</summary>${tab(neu,r=>zeile(r,eur(r.netto)))}</details>
  <details><summary class="vg-vh" style="cursor:pointer">Nicht mehr im Bestand (${weg.length})</summary>${tab(weg,r=>zeile(r,eur(r.netto)))}</details>
  <details><summary class="vg-vh" style="cursor:pointer">Preis geändert (${chg.length})</summary>${tab(chg.map(c=>Object.assign({},c.a,{a:c.a,netto:c.n.netto,_alt:c.a.netto})),r=>zeile(r,`${eur(r._alt)} → ${eur(r.netto)} <span class="vg-delta ${r.netto<r._alt?"minus":"plus"}">(${r.netto<r._alt?"−":"+"} ${eur(Math.abs(r.netto-r._alt))})</span>`))}</details>`:""}
  <details style="margin-bottom:6px"><summary class="vg-vh" style="cursor:pointer">Alle Angebote vom Tag des Speicherns (${alt.length})</summary>${tab(alt.slice(),r=>zeile(r,eur(r.netto)))}</details>
  <button class="vg-btn" id="vg-snapclose">Gespeicherten Stand ausblenden</button>`;
  $("vg-snapclose").onclick=()=>{SNAP=null;renderSnap()};
}

/* ---------- Export ---------- */
function exportData(){const R=ref(),mein={quelle:"DEIN ANGEBOT",anbieter:R.anbieter,netto:R.netto,ezT:R.ez,km:R.km,typ:V.typ||"",linie:R.linie,eq:REFEQ,felgen:R.felgen,verf:V.verf||"–",mein:true};
  return{R,rows:ROWS.concat([mein]).filter(r=>r.mein||passt(r)).sort((a,b)=>preis(a)-preis(b))}}
function dl(name,mimeT,content){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type:mimeT}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
function exportHtml(){
  const{R,rows}=exportData(),fc=FEAT1.concat(FIL.mehr?FEAT2:[]),datum=new Date().toLocaleDateString("de-DE");
  const sy=v=>v===J?"✔":v===N?"✘":"?",tr=rows.map((r,i)=>`<tr class="${r.mein?"mein":""}"><td>${i+1}</td><td>${E(r.quelle)}</td><td>${E(r.anbieter)}</td><td class="n">${eur(preis(r))}</td><td>${r.mein?E(r.ezT):ezText(r.ez)}</td><td class="n">${r.km==null?"–":r.km.toLocaleString("de-DE")}</td><td>${E(r.typ)}</td><td>${E(r.linie)}</td>`+fc.map(([k])=>`<td class="c ${r.eq[k]===J?"j":r.eq[k]===N?"x":""}">${sy(r.eq[k])}</td>`).join("")+`<td>${E(r.verf)}</td></tr>`).join("");
  const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Angebotsvergleich ${E(R.name)}</title><style>body{font-family:'DM Sans',system-ui,Segoe UI,Arial,sans-serif;color:#1A2333;margin:24px;background:#fff}h1{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:22px;margin:0 0 4px}h1 em{color:#0A5CD0}.s{color:#4A5F78;margin:0 0 14px}table{border-collapse:collapse;font-size:13px;width:100%}th,td{border-bottom:1px solid #E3E9F2;padding:6px 8px;text-align:left;white-space:nowrap}th{background:#F4F8FD;color:#4A5F78;font-size:11px;text-transform:uppercase}td.n{text-align:right}td.c{text-align:center}td.j{color:#15803D;font-weight:700}td.x{color:#C1121A;font-weight:700}tr.mein{background:#E6F1FF;font-weight:700}.f{color:#4A5F78;font-size:12px;margin-top:10px}</style></head><body><h1>Angebots<em>vergleich</em> – ${E(R.name)}</h1><p class="s">${E(R.ez)} · ${R.km.toLocaleString("de-DE")} km · dein Angebot ${eur(R.netto)} netto · Stand ${datum} · Preise ${FIL.modus==="brutto"?"brutto":FIL.modus==="fracht"?"netto + Fracht "+eur(FRACHT):"netto"}</p><div style="overflow:auto"><table><thead><tr><th>#</th><th>Quelle</th><th>Anbieter</th><th>Preis</th><th>EZ</th><th>km</th><th>Typ</th><th>Linie</th>${fc.map(f=>`<th>${E(f[1])}</th>`).join("")}<th>Verfügbar</th></tr></thead><tbody>${tr}</tbody></table></div><p class="f">✔ vorhanden · ✘ nicht vorhanden · ? aus der Quelle nicht erkennbar. Nur Einkaufspreise, kein Preisabzug für Ausstattung. Interne Lieferantenpreise – nicht weitergeben.</p></body></html>`;
  dl("Angebotsvergleich_"+(R.name.replace(/[^\wäöüÄÖÜß.-]+/g,"_").slice(0,50))+"_"+new Date().toISOString().slice(0,10)+".html","text/html;charset=utf-8",html);
}
function exportCsv(){
  const{R,rows}=exportData(),fc=FEAT,q=s=>'"'+String(s==null?"":s).replace(/"/g,'""')+'"';
  const head=["Rang","Quelle","Anbieter","Preis netto","Preis brutto","EZ","km","Typ","Linie","Felgen","Verfügbar"].concat(fc.map(f=>LANG[f[0]]));
  const lines=[head.map(q).join(";")].concat(rows.map((r,i)=>[i+1,r.quelle,r.anbieter,r.netto,Math.round(r.netto*1.19),r.mein?r.ezT:ezText(r.ez),r.km==null?"":r.km,r.typ,r.linie,r.felgen,r.verf].concat(fc.map(([k])=>r.eq[k]===J?"ja":r.eq[k]===N?"nein":"?")).map(q).join(";")));
  dl("Angebotsvergleich_"+new Date().toISOString().slice(0,10)+".csv","text/csv;charset=utf-8","﻿"+lines.join("\r\n"));
}

/* ---------- Aufbau der Seite ---------- */
const CSS=`
#pane-vergleich .vg-btn{font-family:var(--font-body);font-weight:600;border-radius:12px;border:1px solid var(--border);background:#fff;color:var(--accent-dark);padding:8px 14px;cursor:pointer;font-size:14px}
#pane-vergleich .vg-btn:hover{border-color:var(--accent)}#pane-vergleich .vg-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
#pane-vergleich h2{font-size:1.15rem;margin-bottom:10px}
.vg-drop{border:2px dashed var(--accent);border-radius:14px;padding:14px;background:#F8FBFF;transition:.15s}.vg-drop.over{background:#E6F1FF;border-style:solid}
.vg-drop .lead{font-weight:700;color:var(--accent-dark)}.vg-drop .small{color:var(--sub);font-size:13px;margin-bottom:8px}
#pane-vergleich textarea{width:100%;min-height:110px;border:1px solid var(--border);border-radius:10px;font-family:var(--font-body);font-size:14px;padding:10px;resize:vertical;color:var(--ink)}
#pane-vergleich input[type=text],#pane-vergleich input[type=number],#pane-vergleich select{width:100%;border:1.5px solid var(--border);border-radius:10px;background:#fff;color:var(--ink);font-family:var(--font-body);font-size:14px;font-weight:600;padding:7px 10px}
.vg-row2{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}.vg-row2 input[type=text]{flex:1;min-width:220px;width:auto}
#vg-status{margin-top:8px;font-weight:600}.vg-ok{color:#15803D}.vg-warn{color:#C0392B}
.vg-grp{margin-top:12px}.vg-grp h3{font-size:12px;color:var(--sub);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;font-weight:600}
.vg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}.vg-grid .w2{grid-column:span 2}
.vg-fld label{display:block;font-size:12px;color:var(--sub);font-weight:600;margin-bottom:2px}
.vg-fld.ok input,.vg-fld.ok select{border-color:#15803D}.vg-fld.unsicher input,.vg-fld.unsicher select{border-color:#F5C842;background:#FFF8DC}.vg-fld.man input,.vg-fld.man select{border-color:var(--accent-dark)}.vg-fld.leer input,.vg-fld.leer select{border-style:dashed}
.vg-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--sub);margin-top:6px}.vg-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;border:2px solid;margin-right:5px;vertical-align:-2px}
.vg-derived{margin-top:8px;padding:8px 12px;border-radius:10px;background:#F4F8FD;border:1px solid var(--border);font-weight:600}
.vg-eq{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center}.vg-eqh{flex-basis:100%;font-size:12px;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:.04em;margin-top:6px}
.vg-pill{border:1px solid var(--border);background:#F4F8FD;border-radius:999px;padding:4px 12px;font-size:13px;font-weight:600;cursor:pointer;user-select:none}.vg-pill.ja{color:#15803D}.vg-pill.nein{color:#C0392B}.vg-pill.unb{color:var(--sub)}
.vg-verdict{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.vg-kpi{border:1px solid var(--border);border-radius:14px;padding:12px 14px;background:#F4F8FD}.vg-kpi .z{font-family:var(--font-heading);font-weight:700;font-size:24px}.vg-kpi .t{color:var(--sub);font-size:13px}.vg-kpi.gut .z{color:#15803D}.vg-kpi.schlecht .z{color:#C0392B}
.vg-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}.vg-filters label{font-size:13px;color:var(--sub);font-weight:600;display:flex;gap:4px;align-items:center}.vg-filters input[type=number]{width:96px}
.vg-chip{border:1px solid var(--border);background:#fff;border-radius:999px;padding:5px 12px;cursor:pointer;font-weight:600;font-size:13px;user-select:none}.vg-chip.on{background:var(--accent-dark);border-color:var(--accent-dark);color:#fff}
.vg-seg{display:inline-flex;border:1px solid var(--border);border-radius:12px;overflow:hidden}.vg-seg button{border:0;background:#fff;padding:6px 12px;font-weight:600;color:var(--sub);cursor:pointer;font-family:var(--font-body)}.vg-seg button.on{background:var(--accent-dark);color:#fff}
.vg-tw{overflow:auto;border:1px solid var(--border);border-radius:14px;background:#fff;max-height:70vh}
table.vg-main{border-collapse:collapse;width:100%;min-width:1180px;font-size:14px}.vg-main th,.vg-main td{padding:8px 9px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}
.vg-main th{position:sticky;top:0;background:#F4F8FD;font-family:var(--font-heading);font-size:12px;color:var(--sub);text-transform:uppercase;cursor:pointer;z-index:1}.vg-main td.c,.vg-main th.c{text-align:center}.vg-main td.num{text-align:right;font-variant-numeric:tabular-nums}
.vg-main td.typ{max-width:230px;overflow:hidden;text-overflow:ellipsis}.vg-main tr.vg-row:hover{background:#F8FBFF}
.vg-main tr.mein{background:#E6F1FF;font-weight:700}.vg-main tr.mein td:first-child{border-left:4px solid var(--accent)}
.vg-ja{color:#15803D;font-weight:700}.vg-nein{color:#C0392B;font-weight:700}.vg-unb{color:var(--sub);font-weight:700}.vg-delta.minus{color:#15803D;font-weight:700}.vg-delta.plus{color:#C0392B;font-weight:700}
.vg-detail td{background:#F8FBFF;white-space:normal;font-size:13px;color:var(--sub)}
.vg-stand{display:flex;flex-wrap:wrap;gap:8px}.vg-q{border:1px solid var(--border);border-radius:999px;padding:4px 12px;font-size:13px;background:#fff}.vg-q i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:#25D366}.vg-q.warn i{background:#F5C842}.vg-q.rot i{background:#E74C3C}.vg-q.pause i{background:#C9D3DF}.vg-q .m{color:var(--light)}
.vg-foot{color:var(--sub);font-size:12.5px;margin-top:8px}.vg-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.vg-prot{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}.vg-prot th,.vg-prot td{padding:5px 8px;border-bottom:1px solid var(--border);text-align:left}
.vg-vh{margin:10px 0 6px;font-weight:700;color:var(--accent-dark);font-size:14px}.vg-var{display:block;width:100%;text-align:left;border:1px solid var(--border);background:#fff;border-radius:10px;padding:7px 12px;margin-bottom:6px;cursor:pointer;font-family:var(--font-body);font-size:14px;color:var(--ink)}.vg-var:hover{border-color:var(--accent)}.vg-var.on{background:#E6F1FF;border-color:var(--accent-dark);font-weight:600}.vg-var .p{float:right;color:var(--accent-dark);font-weight:700}
#vg-app{display:none;margin-top:10px}#vg-app select{width:auto;min-width:260px}
@media(max-width:760px){.vg-grid .w2{grid-column:span 1}}
`;
function bauen(){
  const st=document.createElement("style");st.textContent=CSS;document.head.appendChild(st);
  $("pane-vergleich").innerHTML=`
  <div class="card"><h2>1 · Fahrzeug einlesen</h2>
    <div class="vg-drop" id="vg-drop"><div class="lead">Datei hier ablegen oder Text einfügen (Strg+V)</div>
      <div class="small">PDF · E-Mail (.eml, .msg) · Text-/HTML-Datei · Anzeigentext · Link. Eine neue Datei ersetzt den alten Inhalt; mehrere Dateien gleichzeitig (z. B. Mail + PDF) werden zusammen gelesen. Das Einlesen läuft im Browser, nichts wird dabei gesendet.</div>
      <textarea id="vg-raw" placeholder="Anzeigentext, E-Mail oder Angebot hier einfügen …"></textarea>
      <div class="vg-row2"><input type="text" id="vg-link" placeholder="Link zur Anzeige (optional)"><button class="vg-btn primary" id="vg-read">Auslesen</button>
        <label class="vg-btn">Datei wählen<input type="file" id="vg-file" multiple hidden accept=".pdf,.eml,.msg,.txt,.html,.htm,.csv"></label><button class="vg-btn" id="vg-clear">Leeren</button><button class="vg-btn" id="vg-appbtn">Aus Fahrzeugvergleich-App</button></div>
      <div id="vg-app"></div><div id="vg-status"></div><div id="vg-var"></div></div>
    <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700;color:var(--accent-dark)">Was wurde erkannt, und woher?</summary><div id="vg-prot"></div></details></div>
  <div class="card"><h2>2 · Fahrzeugdaten – prüfen und korrigieren</h2><div id="vg-form"></div>
    <div class="vg-legend"><span><i style="border-color:#15803D"></i>sicher erkannt</span><span><i style="border-color:#F5C842;background:#FFF8DC"></i>unsicher oder berechnet – bitte prüfen</span><span><i style="border-color:var(--border);border-style:dashed"></i>nicht gefunden</span><span><i style="border-color:var(--accent-dark)"></i>von dir geändert</span></div>
    <div class="vg-derived" id="vg-derived"></div>
    <div class="vg-grp"><h3>Ausstattung – Klick wechselt ✔ → ✘ → ?</h3><div class="vg-eq" id="vg-eq"></div>
      <div class="vg-foot">✔ nur, wenn der Text es nennt · ✘ nur bei „ohne …“ oder passendem Antrieb · sonst „?“. Nichts wird geraten.</div></div></div>
  <div class="card"><h2>3 · Ergebnis</h2><div class="vg-verdict" id="vg-verdict"></div>
    <div class="vg-foot">Nur Einkaufspreise netto. Kein Marktwert, kein DB1, kein Preisabzug für Ausstattung. <span id="vg-load"></span></div></div>
  <div class="card"><h2>4 · Vergleichbare Angebote</h2>
    <div class="vg-filters"><span class="vg-seg" id="vg-modus"><button data-m="netto">Netto</button><button data-m="brutto">Brutto</button><button data-m="fracht">Netto + Fracht</button></span>
      <b style="font-size:13px;color:var(--sub)">Kraftstoff</b><span id="vg-fkraft" style="display:contents"></span><b style="font-size:13px;color:var(--sub)">Getriebe</b><span id="vg-fgetr" style="display:contents"></span>
      <label>EZ ab <input type="number" id="vg-ez" min="1990" max="2100" placeholder="Jahr"></label><label>km bis <input type="number" id="vg-km" min="0" step="1000" placeholder="km"></label><span class="vg-chip" id="vg-fps">PS ±15 %</span></div>
    <div class="vg-filters"><b style="font-size:13px;color:var(--sub)">Linie</b><span id="vg-flinie" style="display:contents"></span><span class="vg-chip" id="vg-flinieun" title="Angebote, bei denen sich die Ausstattungslinie nicht erkennen lässt">Linie unbekannt</span></div>
    <div class="vg-filters" id="vg-zaufbau" style="display:none"><b style="font-size:13px;color:var(--sub)">Aufbau</b><span id="vg-faufbau" style="display:contents"></span><span class="vg-chip" id="vg-faufbauun" title="Angebote, bei denen sich der Aufbau (Kasten, Doka, Pritsche …) aus dem Typtext nicht erkennen lässt">Aufbau unbekannt</span></div>
    <div class="vg-filters"><span class="vg-chip" id="vg-fgleich">Nur gleiche oder bessere Ausstattung</span><span class="vg-chip" id="vg-fpano">Pano ✔</span><span class="vg-chip" id="vg-fsicher">Ohne „?“ bei Stufe 1</span><span class="vg-chip" id="vg-faktuell">Nur frische Quellen (≤ 24 h)</span><span class="vg-chip" id="vg-fmehr">Weitere Ausstattung anzeigen</span><span class="vg-chip" id="vg-fmehrpr">Weitere mitprüfen</span><span class="vg-foot" id="vg-cnt" style="margin:0"></span></div>
    <div class="vg-tw"><table class="vg-main"><thead><tr id="vg-thead"></tr></thead><tbody id="vg-tbody"></tbody></table></div>
    <div class="vg-foot">✔ vorhanden · ✘ nicht vorhanden · ? aus der Quelle nicht erkennbar. „Ausst.“ zählt Stufe-1-Punkte (grün: zusätzliche Stufe 2). Angebote ohne EZ, km oder PS bleiben im Zweifel sichtbar. Zeile anklicken = Details.</div>
    <div class="vg-actions"><button class="vg-btn primary" id="vg-exhtml">Als HTML exportieren</button><button class="vg-btn" id="vg-excsv">CSV</button><button class="vg-btn" onclick="window.print()">Drucken / PDF</button></div>
    <div class="vg-actions"><input type="text" id="vg-sname" placeholder="Name für den Vergleich (leer = Fahrzeug + Datum)" style="max-width:380px"><button class="vg-btn primary" id="vg-save">Vergleich speichern</button></div><div id="vg-smsg" class="vg-foot"></div></div>
  <div class="card"><h2>Gespeicherte Vergleiche</h2><div class="vg-foot" style="margin:0 0 8px">Team-Ablage: alle mit Rolle Admin oder Verkauf sehen alle Vergleiche; löschen darf nur der Ersteller oder ein Admin. Gespeichert werden Vorgaben und eine Momentaufnahme der Angebote im aktuellen Filter.</div><div id="vg-liste">Lade …</div><div id="vg-snap" style="margin-top:12px"></div></div>
  <div class="card"><h2>5 · Datenstand der Quellen</h2><div class="vg-stand" id="vg-stand"></div><div class="vg-foot">Fehlt eine Quelle, kann ein günstigeres Angebot fehlen.</div></div>`;
  const drop=$("vg-drop");
  ["dragenter","dragover"].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add("over")}));
  ["dragleave","drop"].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove("over")}));
  drop.addEventListener("drop",ev=>{const dt=ev.dataTransfer;if(dt.files&&dt.files.length)handleFiles([...dt.files]);else{const t=dt.getData("text/plain")||dt.getData("text/uri-list");if(t){$("vg-raw").value=($("vg-raw").value?$("vg-raw").value+"\n":"")+t;run("Text")}}});
  document.addEventListener("paste",ev=>{if($("pane-vergleich").style.display==="none")return;const fs=ev.clipboardData&&ev.clipboardData.files;if(fs&&fs.length){ev.preventDefault();handleFiles([...fs])}});
  $("vg-raw").addEventListener("paste",()=>setTimeout(()=>run("Text"),50));
  $("vg-file").onchange=e=>{handleFiles([...e.target.files]);e.target.value=""};
  $("vg-read").onclick=()=>run("");$("vg-appbtn").onclick=appLaden;
  $("vg-clear").onclick=()=>{$("vg-raw").value="";$("vg-link").value="";V={};CONF={};SRC={};REFEQ={};META={};ROWS=[];ROWKEY="";setStatus("");$("vg-var").innerHTML="";$("vg-prot").innerHTML="";$("vg-load").textContent="";renderForm();renderEq();renderErgebnis()};
  document.querySelectorAll("#vg-modus button").forEach(b=>b.onclick=()=>{FIL.modus=b.dataset.m;renderErgebnis()});
  [["vg-fps","ps"],["vg-fgleich","gleich"],["vg-fpano","pano"],["vg-fsicher","sicher"],["vg-faktuell","aktuell"],["vg-fmehr","mehr"],["vg-fmehrpr","mehrPr"]].forEach(([id,k])=>$(id).onclick=()=>{FIL[k]=!FIL[k];renderErgebnis()});
  $("vg-flinieun").onclick=()=>{FIL.linieUnb=!FIL.linieUnb;renderErgebnis()};
  $("vg-faufbauun").onclick=()=>{FIL.aufbauUnb=!FIL.aufbauUnb;renderErgebnis()};
  $("vg-ez").oninput=e=>{FIL.ezAb=parseInt(e.target.value)||null;renderErgebnis()};$("vg-km").oninput=e=>{FIL.kmBis=parseInt(e.target.value)||null;renderErgebnis()};
  $("vg-save").onclick=vgSpeichern;$("vg-exhtml").onclick=exportHtml;$("vg-excsv").onclick=exportCsv;
  renderForm();renderEq();renderErgebnis();
}
window.VG={
  show(){if(!built){built=true;bauen();ladeStand();vgListe()}else{ladeStand();vgListe()}},
  _test:{parseVehicle,applyParsed,get V(){return V},get ROWS(){return ROWS},set ROWS(x){ROWS=x},renderErgebnis,FIL:()=>FIL,normRow,passt,standardFilter,exportHtml,vgSpeichern,vgListe,vgOeffnen,vgLoeschen,renderSnap,get SNAP(){return SNAP}}
};

})();
