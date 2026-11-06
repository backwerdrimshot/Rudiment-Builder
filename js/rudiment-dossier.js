(function(){
"use strict";
const $=id=>document.getElementById(id), mobile=matchMedia("(max-width:759px)"), homes=new Map();
function move(n,p,reorder=false){if(n.parentNode===p&&!reorder)return;const focused=n.contains(document.activeElement)?document.activeElement:null;if(!homes.has(n)){const m=document.createComment("profile return");n.before(m);homes.set(n,m);}p.append(n);if(focused){const disclosure=focused.closest("details");if(disclosure)disclosure.open=true;focused.focus({preventScroll:true});}}
const layout=document.querySelector("main.layout"),stage=document.querySelector(".area-sticking"),dock=document.querySelector(".dock");
const view=document.createElement("section");view.id="rudimentDossier";view.hidden=true;view.setAttribute("aria-label","Single Paradiddle profile");
view.innerHTML='<header class="dossier-heading"><p class="dossier-membership">DIDDLE · PAS 40 #16 · NARD 26</p></header><div class="dossier-scroll"><div class="dossier-practice"></div><div class="dossier-learning"><details class="dossier-section"><summary>Teaching points</summary><div class="dossier-content"><h3>Two singles. One double. Then switch leads.</h3><p>Keep the doubles even. Let the first note of each group speak clearly, while the other notes stay relaxed. Build a steady sound before speed.</p></div></details><details class="dossier-section"><summary>Background &amp; heritage</summary><div class="dossier-content"><p>Single Paradiddle is PAS rudiment #16 and is included in the NARD Standard 26 American Drum Rudiments.</p><p class="hint">Membership, not endorsement. Original notation is reused from Rudiment Room.</p><p><a href="https://pas.org/wp-content/uploads/2024/04/pas-rudiments.pdf" target="_blank" rel="noopener">PAS official chart</a> · <a href="https://www.nard.us.com/N.A.R.D._Rudiments.html" target="_blank" rel="noopener">NARD official list</a></p></div></details></div><details class="dossier-section dossier-exercises"><summary>Exercises · 3 concepts</summary><div class="dossier-content"><p class="hint">Practice ideas for the displayed rudiment, not additional scored exercises or automatic modes.</p><article><h3>01 · Even doubles</h3><p>Repeat the full eight-stroke cycle. Keep the two notes of each double equal in sound.</p><p class="hint">Listen for: a smooth, even line.</p></article><article><h3>02 · Lead accents</h3><p>Bring out the first note of each four-note group. Keep the other notes lower and relaxed.</p><p class="hint">Listen for: a strong first note, alternating hands.</p></article><article><h3>03 · Hear each hand</h3><p>Listen to Right, then Left, then Both. Keep the silent hand’s place in time.</p><p class="hint">Listen for: spacing, not extra speed.</p></article></div></details></div>';
layout.append(view);
const scrollRegion=view.querySelector(".dossier-scroll");
scrollRegion.tabIndex=0;scrollRegion.setAttribute("role","region");scrollRegion.setAttribute("aria-label","Notation, sticking and learning");
scrollRegion.addEventListener("keydown",event=>{
  if(!mobile.matches||!["PageDown","PageUp"].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey)return;
  event.preventDefault();
  scrollRegion.scrollBy({top:(event.key==="PageDown"?1:-1)*scrollRegion.clientHeight*.8,behavior:"instant"});
});
const heading=view.querySelector(".dossier-heading"),practice=view.querySelector(".dossier-practice"),nav=document.querySelector(".setup-row");
const sticking=document.createElement("div");sticking.className="dossier-sticking";sticking.innerHTML='<h3>Practice sticking</h3>';
const extras=document.createElement("div");extras.className="dossier-extra-controls";
let active=false;
function arrange(){
const wanted=window.settings?.rudimentId==="single-paradiddle"&&!document.body.classList.contains("class-view")&&!document.fullscreenElement;
if(wanted&&!active){
active=true;view.hidden=false;document.body.classList.add("dossier-active");
move(stage,practice);move(document.querySelector(".stick-head"),heading);heading.prepend(heading.querySelector(".stick-head"));move($("btnFavorite"),nav);
$("notation").after(sticking);move($("sticking"),sticking);move($("handListening"),stage);
const controls=dock.querySelector(".dock-controls");controls.append(extras);
["btnReset","btnFull","btnClassView","btnMute","btnClean"].forEach(id=>move($(id),extras));
move(dock.querySelector(".self-assessment"),controls);
const transport=dock.querySelector(".transport");move($("tempoStep"),transport,true);transport.prepend($("tempoStep"));
view.querySelectorAll(".dossier-section").forEach(d=>d.open=!mobile.matches);
}else if(!wanted&&active){
active=false;const focused=document.activeElement;[...homes].reverse().forEach(([n,m])=>m.replaceWith(n));if(focused&&focused!==document.body)focused.focus({preventScroll:true});homes.clear();sticking.remove();extras.remove();view.hidden=true;document.body.classList.remove("dossier-active");
}
if(active){move(dock,mobile.matches?view:practice);view.style.setProperty("--dossier-top",(view.getBoundingClientRect().top+scrollY)+"px");}
}
document.addEventListener("rudiment-rendered",arrange);
document.addEventListener("practice-view-changed",arrange);
document.addEventListener("fullscreenchange",arrange);
mobile.addEventListener("change",()=>{if(active){view.querySelectorAll(".dossier-section").forEach(d=>d.open=!mobile.matches);arrange();}});
window.addEventListener("resize",arrange);
arrange();
})();