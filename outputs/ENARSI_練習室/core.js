(function(root){
'use strict';
const normal=s=>String(s||'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'');
const idOK=s=>/^[ABC][1-9]\d{0,4}$/.test(s);
function shuffled(items,random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function sameSet(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&new Set(a).size===a.length&&a.every(x=>b.includes(x));}
function grade(q,answer,note){if(q.type==='choice')return sameSet(answer||[],q.answer||[]);if(note?.drag?.pairs){const pairs=note.drag.pairs;return pairs.length>0&&pairs.every(([target,item])=>answer?.[item]===target)&&Object.keys(answer||{}).length===new Set(pairs.map(p=>p[1])).size;}return null;}
function remaining(exam,now=Date.now()){return Math.max(0,Math.ceil((exam.deadline-now)/1000));}
function formatTime(seconds){const s=Math.max(0,Math.floor(seconds));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function scoring(maxScore,passScore){
 const max=Number(maxScore),pass=Number(passScore);
 if(!Number.isInteger(max)||max<1||max>100000||!Number.isInteger(pass)||pass<1||pass>max)throw Error('滿分須為 1–100000 的整數；及格分數須介於 1 與滿分之間。');
 return {maxScore:max,passScore:pass};
}
function scoreResult(correct,total,rule){
 if(!Number.isInteger(correct)||!Number.isInteger(total)||total<1||correct<0||correct>total)throw Error('作答統計不完整。');
 const percent=correct/total*100;
 if(!rule)return {percent,points:null,passed:null};
 const s=scoring(rule.maxScore,rule.passScore),raw=correct/total*s.maxScore;
 return {...s,percent,points:Math.floor(raw*100+1e-8)/100,passed:correct*s.maxScore>=s.passScore*total};
}
function examSelectionSettings(s={}){
 const legacy=typeof s.chapter==='string'&&s.chapter!=='all'?s.chapter:null;
 const chapters=[...new Set((Array.isArray(s.chapters)?s.chapters:legacy?[legacy]:[]).filter(x=>typeof x==='string'&&/^[AB]\d{2,3}$/.test(x)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 return {selectionMode:['all','chapters','range'].includes(s.selectionMode)?s.selectionMode:legacy?'chapters':'all',chapters,rangeFrom:String(s.rangeFrom??'A1').trim().toUpperCase().slice(0,16),rangeTo:String(s.rangeTo??'A400').trim().toUpperCase().slice(0,16)};
}
function parseQuestionRange(from,to){
 const a=/^([ABC])([1-9]\d{0,4})$/.exec(String(from??'').trim().toUpperCase()),b=/^([ABC])([1-9]\d{0,4})$/.exec(String(to??'').trim().toUpperCase());
 if(!a||!b)throw Error('請填寫完整題號，例如 A1 與 A400。');
 if(a[1]!==b[1])throw Error('起訖題號須屬於同一類，例如 A1–A400；跨類請用章節複選。');
 if(Number(a[2])>Number(b[2]))throw Error('起始題號不可大於結束題號。');
 return {prefix:a[1],from:Number(a[2]),to:Number(b[2])};
}
function examSelectionError(settings){
 const s=examSelectionSettings(settings);
 if(s.selectionMode==='chapters'&&!s.chapters.length)return '請至少勾選一個章節。';
 if(s.selectionMode==='range')try{parseQuestionRange(s.rangeFrom,s.rangeTo);}catch(e){return e.message;}
 return '';
}
function examSelectionMatches(q,settings){
 const s=examSelectionSettings(settings);
 if(s.selectionMode==='all')return true;
 if(s.selectionMode==='chapters')return s.chapters.includes(q.chapter);
 try{const r=parseQuestionRange(s.rangeFrom,s.rangeTo),m=/^([ABC])([1-9]\d*)$/.exec(q.id);return !!m&&m[1]===r.prefix&&Number(m[2])>=r.from&&Number(m[2])<=r.to;}catch{return false;}
}
function examSelectionLabel(settings){
 const s=examSelectionSettings(settings);
 return s.selectionMode==='all'?'全部題號':s.selectionMode==='chapters'?(s.chapters.join('、')||'尚未勾選章節'):`${s.rangeFrom}–${s.rangeTo}`;
}

function examSettings(s={}){
 let rule;try{rule=scoring(s.maxScore??1000,s.passScore??825);}catch{rule={maxScore:1000,passScore:825};}
 return {...rule,...examSelectionSettings(s),count:Number.isInteger(s.count)&&s.count>0&&s.count<=10000?s.count:45,minutes:Number.isInteger(s.minutes)&&s.minutes>0&&s.minutes<=240?s.minutes:90,scope:['all','bookmarked','wrong','uncertain','chinese','unseen','untested','repeated','mastered','resting','due','learning'].includes(s.scope)?s.scope:'all',unit:typeof s.unit==='string'?s.unit:'all',domain:typeof s.domain==='string'?s.domain:'all',chapter:typeof s.chapter==='string'?s.chapter:'all',drag:s.drag!==false,excludeMastered:false,masteryMode:s.masteryMode==='strict'?'strict':'standard',reviewDays:[3,7,14].includes(s.reviewDays)?s.reviewDays:7,studyPlan:s.studyPlan==='standard'?'standard':'sprint',samplingMode:s.samplingMode==='balanced'?'balanced':'adaptive',examDate:validExamDate(s.examDate)?s.examDate:'2026-11-26'};
}
function canGrade(q,notes){return q.type==='choice'||(q.type==='drag'&&!!notes?.[q.id]?.drag?.pairs?.length);}
function recentResults(p){return Array.isArray(p?.recentResults)?p.recentResults.filter(x=>typeof x==='boolean').slice(-10):typeof p?.correct==='boolean'?[p.correct]:[];}
function recordOutcome(p,answer,correct,time){return {...p,...(correct===false?{masteryLapseAt:time}:{}),correct,answer:JSON.parse(JSON.stringify(answer||[])),count:(Number(p?.count)||0)+1,last:time,recentResults:[...recentResults(p),!!correct].slice(-10)};}
const DAY=86400000;
// A scheduling heuristic, not a validated psychometric model or a sequential test.
// One-sided Wilson lower bound: NIST TN 2119, section 2.3.
function wilsonLower(successes,total,z=1.2815515655446004){
 if(!Number.isInteger(total)||total<1||!Number.isInteger(successes)||successes<0||successes>total||!Number.isFinite(z)||z<=0)return 0;
 const p=successes/total,z2=z*z;
 return Math.max(0,(p+z2/(2*total)-z*Math.sqrt(p*(1-p)/total+z2/(4*total*total)))/(1+z2/total));
}
function masteryPolicy(settings={}){const s=examSettings(settings);return {confidence:s.masteryMode==='strict'?95:90,z:s.masteryMode==='strict'?1.6448536269514722:1.2815515655446004,target:.8,minimum:7,gap:DAY,window:20,maxAge:90*DAY,reviewDays:s.studyPlan==='sprint'?1:s.reviewDays,sprint:s.studyPlan==='sprint'};}
function validExamDate(value){if(typeof value!=='string'||!/^20\d\d-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
function examTimeline(settings={},now=Date.now()){
 const s=examSettings(settings),today=new Date(now),[y,m,d]=s.examDate.split('-').map(Number),days=Math.round((Date.UTC(y,m-1,d)-Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/DAY);
 return {days,finalReview:days<=3,firstPassDays:Math.max(1,days-3),reviewStart:new Date(y,m-1,d-3).getTime()};
}
function evidenceTime(v){const n=typeof v==='string'?Date.parse(v):NaN;return Number.isFinite(n)&&n>=946684800000?n:NaN;}
function cleanEvidence(entries,now=Date.now()){
 const byId=new Map();
 for(const e of Array.isArray(entries)?entries:[]){
  if(!e||typeof e.examId!=='string'||!e.examId.length||e.examId.length>160||typeof e.correct!=='boolean')continue;
  const at=evidenceTime(e.at),start=evidenceTime(e.started);
  if(!Number.isFinite(at)||!Number.isFinite(start)||at>now||start>at)continue;
  const old=byId.get(e.examId);
  byId.set(e.examId,{examId:e.examId,at:new Date(old?Math.max(at,Date.parse(old.at)):at).toISOString(),started:new Date(old?Math.min(start,Date.parse(old.started)):start).toISOString(),correct:e.correct&&(old?.correct!==false),uncertain:e.uncertain===true||old?.uncertain===true});
 }
 return [...byId.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.examId.localeCompare(b.examId)).slice(-200);
}
function addExamEvidence(evidence,result,known,now=Date.now()){
 if(!result||!Array.isArray(result.ids)||!result.results||typeof result.id!=='string')return evidence;
 for(const id of new Set(result.ids))if(known.has(id)&&typeof result.results[id]==='boolean')evidence[id]=cleanEvidence([...(evidence[id]||[]),{examId:result.id,at:result.finished,started:result.started,correct:result.results[id],uncertain:result.flags?.[id]===true}],now);
 return evidence;
}
function initializeMastery(state,known,now=Date.now()){
 const evidence={};for(const [id,entries]of Object.entries(state.masteryEvidence||{}))if(known.has(id)){const clean=cleanEvidence(entries,now);if(clean.length)evidence[id]=clean;}
 // Migrate only real, timestamped completed results. Counts alone cannot reconstruct trials.
 if(state.masteryVersion!==1)for(const r of (Array.isArray(state.history)?state.history:[]))addExamEvidence(evidence,r,known,now);
 const deleted=new Set((state.deletedHistory||[]).map(r=>r.id));for(const id of Object.keys(evidence)){evidence[id]=evidence[id].filter(e=>!deleted.has(e.examId));if(!evidence[id].length)delete evidence[id];}
 state.masteryVersion=1;state.masteryEvidence=evidence;
 for(const p of Object.values(state.progress||{}))if(p&&p.correct===false&&!p.masteryLapseAt)p.masteryLapseAt=p.last;
 return state;
}
// Source-attributed outcomes let deletion/undo rebuild derived statistics without
// erasing later practice. Tombstoned exams stay in the ledger for reversible undo.
const copyLearning=value=>JSON.parse(JSON.stringify(value));
function cleanLearningEvents(entries,now=Date.now()){
 const unique=new Map();
 for(const e of Array.isArray(entries)?entries:[]){
  if(!e||!['exam','practice'].includes(e.source)||typeof e.key!=='string'||e.key.length>180||typeof e.correct!=='boolean')continue;
  const at=evidenceTime(e.at);if(!Number.isFinite(at)||at>now)continue;
  if(e.source==='exam'&&(typeof e.examId!=='string'||!e.examId||e.key!=='exam:'+e.examId||!Number.isFinite(evidenceTime(e.started))||Date.parse(e.started)>at))continue;
  unique.set(e.key,copyLearning(e));
 }
 return [...unique.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||(a.order||0)-(b.order||0)||a.key.localeCompare(b.key));
}
function appendExamLearning(state,result,known,now=Date.now()){
 if(!result||typeof result.id!=='string'||!Array.isArray(result.ids)||!result.results)return;
 state.learningLog||={};
 for(const id of new Set(result.ids))if(known.has(id)&&typeof result.results[id]==='boolean'){
  const event={key:'exam:'+result.id,source:'exam',examId:result.id,at:result.finished,started:result.started,correct:result.results[id],uncertain:result.flags?.[id]===true,answer:copyLearning(result.answers?.[id]||[]),order:0};
  state.learningLog[id]=cleanLearningEvents([...(state.learningLog[id]||[]),event],now);
 }
}
function rebuildLearning(state,known,now=Date.now()){
 const deleted=new Set((state.deletedHistory||[]).map(r=>r.id)),progress={},evidence={};
 for(const id of known){
  let p=state.learningBaseline?.[id]?copyLearning(state.learningBaseline[id]):undefined;
  const events=cleanLearningEvents(state.learningLog?.[id],now).filter(e=>e.source!=='exam'||!deleted.has(e.examId));
  for(const e of events){p=recordOutcome(p,e.answer,e.correct,e.at);if(e.source==='exam'){
   (evidence[id]||=[]).push({examId:e.examId,at:e.at,started:e.started,correct:e.correct,uncertain:!!e.uncertain});
  }}
  if(typeof p?.correct==='boolean')progress[id]=p;
 }
 state.progress=progress;state.masteryVersion=1;state.masteryEvidence={};
 for(const [id,entries]of Object.entries(evidence))state.masteryEvidence[id]=cleanEvidence(entries,now);
 return state;
}
function initializeLearning(state,known,now=Date.now()){
 state.history=Array.isArray(state.history)?state.history:[];state.deletedHistory=Array.isArray(state.deletedHistory)?state.deletedHistory:[];
 if(state.learningResetBackup)state.learningResetBackup=cleanLearningReset(state.learningResetBackup,known,now);
 if(state.learningLogVersion===1){
  state.learningBaseline=Object.fromEntries(Object.entries(state.learningBaseline||{}).filter(([id,p])=>known.has(id)&&p&&typeof p==='object').map(([id,p])=>[id,copyLearning(p)]));
  state.learningLog=Object.fromEntries(Object.entries(state.learningLog||{}).filter(([id])=>known.has(id)).map(([id,events])=>[id,cleanLearningEvents(events,now)]));
  return rebuildLearning(state,known,now);
 }
 const oldProgress=copyLearning(state.progress||{}),oldEvidence=copyLearning(state.masteryEvidence||{});
 state.learningLegacyBackup={at:new Date(now).toISOString(),progress:oldProgress,masteryEvidence:oldEvidence};
 state.learningLog={};state.learningBaseline={};
 // Retained raw evidence also covers legitimate exams aged out of the 40-result UI.
 for(const [id,entries]of Object.entries(oldEvidence))if(known.has(id))for(const e of cleanEvidence(entries,now)){
  (state.learningLog[id]||=[]).push({key:'exam:'+e.examId,source:'exam',examId:e.examId,at:e.at,started:e.started,correct:e.correct,uncertain:e.uncertain,order:0});
 }
 for(const result of [...state.history,...state.deletedHistory])appendExamLearning(state,result,known,now);
 const unresolved=[];
 for(const [id,p]of Object.entries(oldProgress))if(known.has(id)&&p&&typeof p==='object'){
  const exams=state.learningLog[id]||[];
  if(!exams.length){state.learningBaseline[id]=copyLearning(p);continue;}
  // Old finishExam recorded each question immediately after setting finished.
  // A matching outcome/time identifies that aggregate's latest exam contribution.
  const matches=(time,correct,answer)=>exams.some(e=>{const delta=evidenceTime(time)-Date.parse(e.at);return delta>=0&&delta<=2000&&e.correct===correct&&(answer===undefined||e.answer===undefined||JSON.stringify(answer)===JSON.stringify(e.answer));});
  let remaining=Math.max(0,(Number(p.count)||1)-exams.length),inferred=0;
  if(typeof p.correct==='boolean'&&Number.isFinite(evidenceTime(p.last))&&!matches(p.last,p.correct,p.answer)&&remaining>0){
   state.learningLog[id].push({key:'practice:legacy-last:'+id,source:'practice',at:p.last,correct:p.correct,answer:copyLearning(p.answer||[]),order:1});inferred++;
  }
  const lapse=p.masteryLapseAt;
  if(Number.isFinite(evidenceTime(lapse))&&!matches(lapse,false)&&lapse!==p.last&&remaining>inferred){
   state.learningLog[id].push({key:'practice:legacy-lapse:'+id,source:'practice',at:lapse,correct:false,order:1});inferred++;
  }
  remaining-=inferred;
  if(remaining>0){state.learningBaseline[id]={count:remaining};unresolved.push(id);}
  state.learningLog[id]=cleanLearningEvents(state.learningLog[id],now);
 }
 state.learningLogVersion=1;
 state.learningMigration={at:new Date(now).toISOString(),excludedDeletedExams:new Set(state.deletedHistory.map(r=>r.id)).size,unresolvedIds:unresolved};
 return rebuildLearning(state,known,now);
}
function recordPracticeLearning(state,id,answer,correct,time,known){
 const now=Date.parse(time);if(state.learningLogVersion!==1)initializeLearning(state,known,now);
 const entries=state.learningLog[id]||[],order=[...entries,...(state.learningResetBackup?.learningLog?.[id]||[])].reduce((n,e)=>Math.max(n,Number(e.order)||0),0)+1;
 entries.push({key:'practice:'+time+':'+order,source:'practice',at:time,correct:!!correct,answer:copyLearning(answer||[]),order});state.learningLog[id]=entries;
 return rebuildLearning(state,known,now);
}
function recordExamLearning(state,result,known,now=Date.now()){
 if(state.learningLogVersion!==1)initializeLearning(state,known,now);
 appendExamLearning(state,result,known,now);return rebuildLearning(state,known,now);
}
function deleteExamLearning(state,id,known,now=Date.now()){
 if(state.exam)return false;
 if(state.learningLogVersion!==1)initializeLearning(state,known,now);
 const index=state.history.findIndex(r=>r.id===id);if(index<0)return false;
 const [result]=state.history.splice(index,1);state.deletedHistory=state.deletedHistory.filter(r=>r.id!==id);
 state.deletedHistory.unshift({...result,deletedAt:new Date(now).toISOString()});rebuildLearning(state,known,now);return true;
}
function restoreExamLearning(state,known,now=Date.now()){
 if(state.exam||!state.deletedHistory?.length||state.history.length>=40)return false;
 if(state.learningLogVersion!==1)initializeLearning(state,known,now);
 const {deletedAt,...result}=state.deletedHistory.shift();
 if(!state.history.some(r=>r.id===result.id))state.history.push(result);
 state.history.sort((a,b)=>Date.parse(b.finished)-Date.parse(a.finished));rebuildLearning(state,known,now);return true;
}

// A single recoverable reset removes source records; derived statistics are rebuilt.
// Undo merges the removed records with later activity instead of replacing progress.
function cleanLearningReset(backup,known,now=Date.now()){
 if(!backup||backup.version!==1||!['practice','all'].includes(backup.mode)||!Number.isFinite(evidenceTime(backup.at))||Date.parse(backup.at)>now)return null;
 const learningLog={},learningBaseline={};
 for(const [id,events]of Object.entries(backup.learningLog||{}))if(known.has(id)){
  const clean=cleanLearningEvents(events,now).filter(e=>backup.mode==='all'||e.source==='practice');if(clean.length)learningLog[id]=clean;
 }
 for(const [id,p]of Object.entries(backup.learningBaseline||{}))if(known.has(id)&&p&&typeof p==='object'&&(typeof p.correct==='boolean'||Number(p.count)>0))learningBaseline[id]=copyLearning(p);
 const results=rows=>(Array.isArray(rows)?rows:[]).filter(r=>r&&typeof r.id==='string'&&Array.isArray(r.ids)&&r.ids.length&&r.ids.every(id=>known.has(id))&&r.answers&&r.results).map(copyLearning);
 return {version:1,mode:backup.mode,at:backup.at,learningLog,learningBaseline,history:backup.mode==='all'?results(backup.history):[],deletedHistory:backup.mode==='all'?results(backup.deletedHistory):[],learningMigration:backup.learningMigration?copyLearning(backup.learningMigration):null,learningLegacyBackup:backup.learningLegacyBackup?copyLearning(backup.learningLegacyBackup):null};
}
function learningResetInfo(state,known,mode='practice',now=Date.now()){
 const ids=new Set();let events=0;
 for(const [id,entries]of Object.entries(state.learningLog||{}))if(known.has(id))for(const e of cleanLearningEvents(entries,now))if(mode==='all'||e.source==='practice'){ids.add(id);events++;}
 const legacyIds=Object.entries(state.learningBaseline||{}).filter(([id,p])=>known.has(id)&&p&&(typeof p.correct==='boolean'||Number(p.count)>0)).map(([id])=>id);legacyIds.forEach(id=>ids.add(id));
 const exams=mode==='all'?(state.history||[]).length:0,deletedExams=mode==='all'?(state.deletedHistory||[]).length:0;
 return {questions:ids.size,events,legacyQuestions:legacyIds.length,exams,deletedExams,available:!!(ids.size||exams||deletedExams)};
}
function resetLearning(state,mode,known,now=Date.now()){
 if(state.exam||!['practice','all'].includes(mode))return false;
 if(state.learningLogVersion!==1)initializeLearning(state,known,now);
 if(!learningResetInfo(state,known,mode,now).available)return false;
 const removed={},kept={};
 for(const [id,entries]of Object.entries(state.learningLog||{}))if(known.has(id)){
  const clean=cleanLearningEvents(entries,now),take=clean.filter(e=>mode==='all'||e.source==='practice'),keep=clean.filter(e=>mode!=='all'&&e.source!=='practice');
  if(take.length)removed[id]=take;if(keep.length)kept[id]=keep;
 }
 state.learningResetBackup=cleanLearningReset({version:1,mode,at:new Date(now).toISOString(),learningLog:removed,learningBaseline:state.learningBaseline||{},history:state.history,deletedHistory:state.deletedHistory,learningMigration:state.learningMigration,learningLegacyBackup:state.learningLegacyBackup},known,now);
 state.learningLog=kept;state.learningBaseline={};delete state.learningLegacyBackup;
 if(mode==='all'){state.history=[];state.deletedHistory=[];delete state.learningMigration;}
 else if(state.learningMigration)state.learningMigration={...state.learningMigration,unresolvedIds:[]};
 rebuildLearning(state,known,now);return true;
}
function learningResetRestoreError(state,known,now=Date.now()){
 if(state.exam)return '請先完成目前的測驗。';
 const backup=cleanLearningReset(state.learningResetBackup,known,now);if(!backup)return '沒有可還原的清除紀錄。';
 const current=new Set([...(state.history||[]),...(state.deletedHistory||[])].map(r=>r.id));
 const added=new Set(backup.history.filter(r=>!current.has(r.id)).map(r=>r.id));
 if((state.history||[]).length+added.size>40)return '還原後會超過 40 筆成績，請先到模擬測驗刪除部分成績，再還原。';
 return '';
}
function restoreLearningReset(state,known,now=Date.now()){
 if(learningResetRestoreError(state,known,now))return false;
 if(state.learningLogVersion!==1)initializeLearning(state,known,now);
 const backup=cleanLearningReset(state.learningResetBackup,known,now);
 const current=new Set([...(state.history||[]),...(state.deletedHistory||[])].map(r=>r.id));
 for(const key of ['history','deletedHistory'])for(const r of backup[key])if(!current.has(r.id)){state[key].push(copyLearning(r));current.add(r.id);}
 state.history.sort((a,b)=>Date.parse(b.finished)-Date.parse(a.finished));state.deletedHistory.sort((a,b)=>Date.parse(b.deletedAt||b.finished)-Date.parse(a.deletedAt||a.finished));
 state.learningBaseline={...backup.learningBaseline,...state.learningBaseline};state.learningLog||={};
 for(const [id,events]of Object.entries(backup.learningLog))state.learningLog[id]=cleanLearningEvents([...events,...(state.learningLog[id]||[])],now);
 if(backup.learningMigration){const present=state.learningMigration||{};state.learningMigration={...backup.learningMigration,...present,unresolvedIds:[...new Set([...(backup.learningMigration.unresolvedIds||[]),...(present.unresolvedIds||[])])].filter(id=>known.has(id))};}
 if(backup.learningLegacyBackup&&!state.learningLegacyBackup)state.learningLegacyBackup=copyLearning(backup.learningLegacyBackup);
 delete state.learningResetBackup;rebuildLearning(state,known,now);return true;
}

function masteryStatus(entries,progress={},flag=false,settings={},now=Date.now()){
 const policy=masteryPolicy(settings),all=cleanEvidence(entries,now),spaced=[],fast=[];
 let previous=-Infinity,lastFailure=-Infinity;
 for(const e of all){const at=Date.parse(e.at),gap=Date.parse(e.started)-previous;if(gap>=policy.gap&&at>=now-policy.maxAge)spaced.push(e);if(gap>=6*3600000&&at>=now-policy.maxAge)fast.push(e);previous=at;if(!e.correct||e.uncertain)lastFailure=Math.max(lastFailure,at);}
 for(const t of [progress?.masteryLapseAt,progress?.correct===false?progress.last:null]){const at=evidenceTime(t);if(at<=now)lastFailure=Math.max(lastFailure,at);}
 const sample=spaced.slice(-policy.window),n=sample.length,k=sample.filter(e=>e.correct&&!e.uncertain).length,lower=wilsonLower(k,n,policy.z),last=sample.at(-1);
 const recentOK=n>=3&&sample.slice(-3).every(e=>e.correct&&!e.uncertain&&Date.parse(e.at)>lastFailure);
 const qualified=n>=policy.minimum&&lower>=policy.target&&recentOK&&!flag;
 const sprintSample=fast.slice(-3),sprintN=sprintSample.length,sprintK=sprintSample.filter(e=>e.correct&&!e.uncertain&&Date.parse(e.at)>lastFailure).length,sprintSpan=sprintN>1?Date.parse(sprintSample.at(-1).at)-Date.parse(sprintSample[0].at):0;
 const sprintReady=policy.sprint&&sprintN===3&&sprintK===3&&sprintSpan>=DAY&&!flag;
 const scheduled=qualified||sprintReady,scheduledAt=policy.sprint&&sprintReady?sprintSample.at(-1).at:last?.at;
 const dueAt=scheduled?Date.parse(scheduledAt)+policy.reviewDays*DAY:null;
 const status=scheduled?(now>=dueAt?'due':qualified?'mastered':'resting'):'learning',reasons=[];
 if(n<policy.minimum)reasons.push(`有效紀錄 ${n}/${policy.minimum} 次`);
 if(lower<policy.target)reasons.push(`保守估計 ${(lower*100).toFixed(1)}%，未達 80%`);
 if(!recentOK)reasons.push('需要最近 3 次有效測驗有把握答對，且在最近錯答／不確定之後');
 if(flag)reasons.push('仍標記不確定');
 if(status==='due')reasons.push('複測時間已到，提高抽題優先級');
 if(!all.length){reasons.length=0;reasons.push('尚無完整模擬紀錄，從下一次測驗開始累積');}
 if(policy.sprint&&status==='learning'&&all.length){reasons.unshift(`衝刺最近有效成功 ${sprintK}/3，跨度 ${(sprintSpan/3600000).toFixed(0)} 小時（需至少 24 小時）`);}
 if(status==='resting'){reasons.length=0;reasons.push('短期穩定，保留低頻抽查；尚未達到統計掌握門檻');}
 const correct=all.filter(e=>e.correct).length;
 return {status,excluded:status==='mastered'||status==='resting',qualified,total:all.length,correct,rate:all.length?correct/all.length:null,n,k,lower,dueAt,lastAt:last?.at||null,nextEligibleAt:all.length?previous+(policy.sprint?6*3600000:policy.gap):null,reasons,policy,sprintN,sprintK,sprintSpan};
}
function masteryFor(q,state,settings=state.examSettings,now=Date.now()){return masteryStatus(state.masteryEvidence?.[q.id],state.progress?.[q.id],!!state.uncertain?.[q.id],settings,now);}
// v2: every selected-scope question stays eligible. Legacy exclusion preferences are ignored.
function excludeFromExam(){return false;}
function samplingInfo(q,state,settings=state.examSettings,now=Date.now()){
 const entries=cleanEvidence(state.masteryEvidence?.[q.id],now),recent=entries.slice(-8),last=entries.at(-1),m=masteryFor(q,state,settings,now),p=state.progress?.[q.id];
 let errors=0,weightTotal=0,weightedErrors=0;recent.forEach((e,i)=>{const w=.8**(recent.length-1-i);weightTotal+=w;if(!e.correct){errors++;weightedErrors+=w;}});
 const recentErrorRate=weightTotal?weightedErrors/weightTotal:0,lastAt=last?Date.parse(last.at):null,ageDays=lastAt===null?null:Math.max(0,(now-lastAt)/DAY);
 const lapse=evidenceTime(p?.masteryLapseAt),practiceLapse=Number.isFinite(lapse)&&lapse<=now&&(lastAt===null||lapse>=lastAt);
 const weak=!!state.uncertain?.[q.id]||last?.correct===false||last?.uncertain===true||practiceLapse||(errors>=2&&recentErrorRate>=.3);
 const category=!entries.length?'untested':weak?'weak':m.status==='mastered'||m.status==='resting'?'stable':'consolidating';
 const overdue=m.status==='due';
 let weight=1+(ageDays===null?0:Math.min(ageDays,14)/7);
 if(category==='weak')weight*=1+2*recentErrorRate+(state.uncertain?.[q.id]?1:0)+(last?.correct===false?1:0);
 if(category==='consolidating')weight*=1+1/(entries.length+1);
 if(overdue)weight*=2;
 if(ageDays!==null&&ageDays<.25)weight*=.15; // Cooldown lowers probability; never removes a question.
 const reason=category==='untested'?'已看過原題庫，尚無本工具的模擬判分':category==='weak'?'近期錯答／不確定需補強':category==='stable'?'短期穩定或統計達標，仍保留低頻抽查':overdue?'到期複測，優先處理最久未測者':'已測過，穩定度證據仍不足';
 return {category,weight:Math.max(.01,weight),overdue,lastAt,ageDays,recentErrorRate,errors,trials:entries.length,reason,mastery:m};
}
function weightedSample(items,count,weight,random=Math.random){
 return items.map(item=>({item,key:-Math.log(Math.max(Number.MIN_VALUE,Math.min(1-Number.EPSILON,random())))/Math.max(.0001,weight(item))})).sort((a,b)=>a.key-b.key).slice(0,count).map(x=>x.item);
}
function allocateSlots(count,shares){
 const sum=shares.reduce((a,x)=>a+x,0);if(!sum)return shares.map(()=>0);
 const exact=shares.map(x=>count*x/sum),slots=exact.map(Math.floor),left=count-slots.reduce((a,x)=>a+x,0);
 exact.map((x,i)=>({i,f:x-slots[i]})).sort((a,b)=>b.f-a.f||a.i-b.i).slice(0,left).forEach(x=>slots[x.i]++);return slots;
}
function selectExamQuestions(pool,count,state,settings,now=Date.now(),random=Math.random,knowledge=null){
 const s=examSettings(settings),timeline=examTimeline(s,now),unique=[...new Map(pool.map(q=>[q.id,q])).values()],limit=Math.min(Math.max(0,Math.floor(count)),unique.length);
 if(!limit)return [];
 const info=new Map(unique.map(q=>[q.id,samplingInfo(q,state,s,now)]));
 function balanced(candidates,n){
  const groups=new Map();for(const q of candidates){const domain=topicFor(q,knowledge).domain;if(!groups.has(domain))groups.set(domain,[]);groups.get(domain).push(q);}
  const arrays=[...groups.values()],slots=allocateSlots(n,arrays.map(g=>g.length));return arrays.flatMap((g,i)=>shuffled(g,random).slice(0,slots[i]));
 }
 if(s.samplingMode==='balanced'||timeline.finalReview){
  if(timeline.finalReview){const fresh=unique.filter(q=>!cleanEvidence(state.masteryEvidence?.[q.id],now).some(e=>Date.parse(e.at)>=timeline.reviewStart)),first=balanced(fresh,Math.min(limit,fresh.length)),used=new Set(first.map(q=>q.id));return shuffled([...first,...balanced(unique.filter(q=>!used.has(q.id)),limit-first.length)],random);}
  return shuffled(balanced(unique,limit),random);
 }
 const categories=['untested','weak','consolidating','stable'],groups=categories.map(c=>unique.filter(q=>info.get(q.id).category===c)),slots=allocateSlots(limit,[50,30,15,5]),chosen=[],used=new Set();
 if(limit<20){slots.fill(0);for(let j=0;j<limit;j++){const shares=[50,30,15,5].map((w,i)=>groups[i].length>slots[i]?w:0),sum=shares.reduce((a,x)=>a+x,0);let pick=Math.min(1-Number.EPSILON,Math.max(0,random()))*sum;for(let i=0;i<shares.length;i++){pick-=shares[i];if(pick<0){slots[i]++;break;}}}}
 // For sessions of at least 20 questions reserve a low-frequency audit when stable items exist.
 if(limit>=20&&groups[3].length&&slots[3]===0){slots[0]--;slots[3]++;}
 for(let i=0;i<groups.length;i++){
  const group=groups[i],n=Math.min(slots[i],group.length),due=i===2?group.filter(q=>info.get(q.id).overdue).sort((a,b)=>info.get(a.id).lastAt-info.get(b.id).lastAt).slice(0,n):[];
  const dueIds=new Set(due.map(q=>q.id));const picks=[...due,...weightedSample(group.filter(q=>!dueIds.has(q.id)),n-due.length,q=>info.get(q.id).weight,random)];
  for(const q of picks){chosen.push(q);used.add(q.id);}
 }
 // Fill empty-category seats in priority order; each item appears at most once per exam.
 for(const group of groups){const more=weightedSample(group.filter(q=>!used.has(q.id)),limit-chosen.length,q=>info.get(q.id).weight,random);for(const q of more){chosen.push(q);used.add(q.id);}}
 return shuffled(chosen,random);
}
function samplingSnapshot(questions,state,settings,now=Date.now()){
 const counts={untested:0,weak:0,consolidating:0,stable:0};for(const q of questions)counts[samplingInfo(q,state,settings,now).category]++;
 return {version:2,selection:examSelectionSettings(settings),mode:examTimeline(settings,now).finalReview?'final':examSettings(settings).samplingMode,counts,priorExposure:'read-once-in-purchased-bank',at:new Date(now).toISOString()};
}
function applySourceCorrections(bank,reference){
 const changed=[];for(const fix of reference?.sourceCorrections||[]){const q=bank.questions?.find(q=>q.id===fix.id),base=reference.questions?.find(q=>q.id===fix.id),o=q?.options?.find(o=>o.label===fix.label),approved=base?.options?.find(o=>o.label===fix.label);if(o&&approved&&o.text===fix.before&&approved.text===fix.after&&q.stem===base.stem&&sameSet(q.answer,base.answer)){o.text=fix.after;changed.push(q.id);}}
 return changed;
}
function sameSourceQuestion(a,b){return !!a&&!!b&&a.id===b.id&&a.type===b.type&&a.stem===b.stem&&JSON.stringify(a.options)===JSON.stringify(b.options)&&JSON.stringify(a.answer)===JSON.stringify(b.answer)&&['images','solution','pages'].every(k=>Array.isArray(a[k])&&Array.isArray(b[k])&&a[k].length===b[k].length&&a[k].every((v,i)=>v===b[k][i]));}
function sameSourceNote(a,b){return !!a&&!!b&&a.stemZh===b.stemZh&&a.html===b.html&&JSON.stringify(a.optionsZh)===JSON.stringify(b.optionsZh)&&JSON.stringify(a.drag||null)===JSON.stringify(b.drag||null);}
function scopeMatches(q,scope,state,notes){
 const p=state.progress?.[q.id];
 if(scope==='untested')return canGrade(q,notes)&&cleanEvidence(state.masteryEvidence?.[q.id]).length===0;
 if(['mastered','resting','due','learning'].includes(scope))return canGrade(q,notes)&&masteryFor(q,state).status===scope;
 return scope==='all'||scope==='bookmarked'&&!!state.bookmarks?.[q.id]||scope==='wrong'&&p?.correct===false||scope==='uncertain'&&!!state.uncertain?.[q.id]||scope==='chinese'&&!!notes?.[q.id]?.html||scope==='unseen'&&canGrade(q,notes)&&typeof p?.correct!=='boolean'||scope==='repeated'&&recentResults(p).filter(x=>!x).length>=2;
}
function topicFor(q,knowledge){const id=knowledge?.byQuestion?.[q.id];return knowledge?.units?.find(u=>u.id===id)||{id:'unmapped',title:'尚未分類',group:'尚未分類',domain:'unmapped'};}
function topicMatches(q,knowledge,filter){const t=topicFor(q,knowledge);return (!filter.unit||filter.unit==='all'||t.id===filter.unit)&&(!filter.domain||filter.domain==='all'||t.domain===filter.domain)&&(!filter.chapter||filter.chapter==='all'||q.chapter===filter.chapter);}
function analyze(questions,knowledge,notes,progress={},flags={}){
 const empty=(id,title)=>({id,title,total:0,available:0,manual:0,attempted:0,correct:0,wrong:0,unseen:0,uncertain:0,repeated:0,notes:0,ids:[]});
 const summary=empty('all','全部'),rows=new Map(),domains=new Map(),chapters=new Map();
 function add(a,q){a.total++;a.ids.push(q.id);if(notes?.[q.id]?.html)a.notes++;if(!canGrade(q,notes)){a.manual++;return;}a.available++;const p=progress[q.id];if(typeof p?.correct==='boolean'){a.attempted++;if(p.correct)a.correct++;else a.wrong++;}else a.unseen++;if(flags[q.id])a.uncertain++;if(recentResults(p).filter(x=>!x).length>=2)a.repeated++;}
 for(const q of questions){if(q.type==='lab')continue;const t=topicFor(q,knowledge),d=knowledge?.domains?.find(d=>d.id===t.domain),ch=q.chapter||q.id[0];
  if(!rows.has(t.id))rows.set(t.id,{...empty(t.id,t.title),group:t.group,domain:t.domain});
  if(!domains.has(t.domain))domains.set(t.domain,empty(t.domain,d?.title||'尚未分類'));
  if(!chapters.has(ch))chapters.set(ch,empty(ch,ch));
  for(const a of [summary,rows.get(t.id),domains.get(t.domain),chapters.get(ch)])add(a,q);
 }
 const finish=a=>({...a,accuracy:a.attempted?a.correct/a.attempted*100:null,coverage:a.available?a.attempted/a.available*100:null});
 const unitOrder=new Map((knowledge?.units||[]).map((u,i)=>[u.id,i])),domainOrder=new Map((knowledge?.domains||[]).map((d,i)=>[d.id,i]));
 return {summary:finish(summary),rows:[...rows.values()].map(finish).sort((a,b)=>(unitOrder.get(a.id)??999)-(unitOrder.get(b.id)??999)),domains:[...domains.values()].map(finish).sort((a,b)=>(domainOrder.get(a.id)??999)-(domainOrder.get(b.id)??999)),chapters:[...chapters.values()].map(finish).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}))};
}
function answerComplete(q,answer,note){return q.type==='choice'?Array.isArray(answer)&&answer.length>0:!!note?.drag?.pairs?.length&&Object.keys(answer||{}).length===note.drag.pairs.length;}
function reviewIds(result,questions,knowledge,filter={}){
 const byid=new Map(questions.map(q=>[q.id,q]));
 return result.ids.filter(id=>{const q=byid.get(id),a=result.answers[id],unanswered=result.unansweredIds?result.unansweredIds.includes(id):!a||(Array.isArray(a)?!a.length:!Object.keys(a).length);return q&&topicMatches(q,knowledge,filter)&&(!filter.status||filter.status==='all'||filter.status==='wrong'&&result.results[id]===false||filter.status==='unanswered'&&unanswered||filter.status==='uncertain'&&!!result.flags?.[id]);});
}
function safeHTML(html){
 if(typeof DOMParser==='undefined')throw Error('需要瀏覽器才能處理網頁內容');
 const pre=String(html||'').replace(/<(script|style|iframe|object|embed|svg|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<(link|input|meta|base|iframe|object|embed)\b[^>]*>/gi,'').replace(/<img\b[^>]*>/gi,tag=>{const m=tag.match(/\bsrc\s*=\s*["'](data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)["']/i);return m?`<img src="${m[1]}" alt="BGW 原筆記附圖">`:'';});
 const doc=new DOMParser().parseFromString(pre,'text/html');
 const allowed=new Set('p br hr div span strong b em i u ul ol li table thead tbody tr td th code pre h2 h3 h4 blockquote a'.split(' '));
 function clean(node){if(node.nodeType===3)return document.createTextNode(node.textContent);if(node.nodeType!==1)return document.createTextNode('');let tag=node.tagName.toLowerCase();if(tag==='img'){const img=document.createElement('img');img.src=node.getAttribute('src');img.alt='BGW 原筆記附圖';img.loading='lazy';return img;}if(tag==='button')tag='h3';if(tag==='span'&&/Consolas|monospace/.test(node.getAttribute('style')||''))tag='code';const el=document.createElement(allowed.has(tag)?tag:'span');if(tag==='a'){const href=node.getAttribute('href')||'';if(/^https:\/\//i.test(href)){el.href=href;el.target='_blank';el.rel='noopener noreferrer';}}for(const child of node.childNodes)el.appendChild(clean(child));return el;}
 const box=document.createElement('div');for(const n of doc.body.childNodes)box.appendChild(clean(n));return box.innerHTML;
}
function validateNotes(notes,questions){
 const known=new Set(questions.map(q=>q.id)),out={};
 for(const [id,n] of Object.entries(notes||{})){
  if(!idOK(id)||!known.has(id)||!n||typeof n!=='object')continue;
  const optionsZh={};for(const [k,v] of Object.entries(n.optionsZh||{}))if(/^[A-H]$/.test(k))optionsZh[k]=String(v).slice(0,10000);
  const v={id,stemZh:String(n.stemZh||'').slice(0,30000),optionsZh,html:safeHTML(String(n.html||'').slice(0,2000000)),source:String(n.source||'使用者提供的 BGW 原文').slice(0,150),imported:String(n.imported||new Date().toISOString()),english:String(n.english||'').slice(0,30000)};
  if(n.drag&&['drag_category','drag_match'].includes(n.drag.type)&&Array.isArray(n.drag.pairs)){const pairs=n.drag.pairs.filter(p=>Array.isArray(p)&&p.length===2&&p.every(x=>typeof x==='string'&&x.length<5000)).slice(0,100);if(pairs.length&&new Set(pairs.map(p=>p[1])).size===pairs.length)v.drag={type:n.drag.type,pairs};}
  out[id]=v;
 }
 return out;
}
function validateBank(bank){
 if(!bank||!Array.isArray(bank.questions)||!bank.questions.length||bank.questions.length>10000)throw Error('這不是有效的 ENARSI 題庫包。');
 const seen=new Set();
 for(const q of bank.questions){
  if(!idOK(q.id)||seen.has(q.id)||!['choice','drag','lab'].includes(q.type)||typeof q.stem!=='string')throw Error('題庫題號或內容格式不正確。');seen.add(q.id);
  if(!Array.isArray(q.images)||!Array.isArray(q.solution)||![...q.images,...q.solution].every(s=>typeof s==='string'&&(/^(data:image\/(webp|png|jpeg);base64,)/.test(s)||/^assets\/[\w.-]+\.(webp|png|jpg)$/.test(s))))throw Error('題庫內的圖片格式不正確。');
  if(q.type==='choice'&&(!Array.isArray(q.options)||!Array.isArray(q.answer)||!q.answer.length||!q.answer.every(a=>q.options.some(o=>o.label===a))||!q.options.every(o=>/^[A-H]$/.test(o.label)&&typeof o.text==='string')))throw Error('選項與答案不完整。');
 }
 if(bank.knowledge){
  const k=bank.knowledge,known=new Set(bank.questions.map(q=>q.id));
  if(!Array.isArray(k.domains)||!Array.isArray(k.units)||!k.byQuestion||typeof k.byQuestion!=='object')bank.knowledge=null;
  else{
   const domains=k.domains.filter(d=>d&&/^[a-z][a-z0-9_-]{0,29}$/.test(d.id)&&typeof d.title==='string').slice(0,30).map(d=>({id:d.id,title:d.title.slice(0,120)})),domainIds=new Set(domains.map(d=>d.id));
   const units=k.units.filter(u=>u&&/^[A-Z][0-9]{2,3}$/.test(u.id)&&domainIds.has(u.domain)&&typeof u.title==='string').slice(0,300).map(u=>({id:u.id,title:u.title.slice(0,160),domain:u.domain,group:String(u.group||'').slice(0,120)})),unitIds=new Set(units.map(u=>u.id));
   bank.knowledge=units.length?{version:1,source:String(k.source||'匯入的知識點分類').slice(0,300),domains,units,byQuestion:Object.fromEntries(Object.entries(k.byQuestion).filter(([id,u])=>known.has(id)&&unitIds.has(u)))}:null;
  }
 }
 return bank;
}
function parseBGW(source,questions){
 let text=String(source||'').trim();if(!text)throw Error('請先貼上題目網頁的原始碼或內容。');if(text.length>3000000)throw Error('一次請貼上一題，或改用檔案匯入。');
 // Inert parsing: remove network-capable elements before constructing the detached document.
 const inert=s=>s.replace(/<(iframe|object|embed|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<(img|link|meta|base|iframe|object|embed)\b[^>]*>/gi,'');
 let doc=new DOMParser().parseFromString(inert(text),'text/html');
 const lines=[...doc.querySelectorAll('.line-content')];
 if(lines.length){text=lines.map(n=>n.textContent).join('\n');doc=new DOMParser().parseFromString(inert(text),'text/html');}
 const en=doc.querySelector('.question-text:not(.question-text-zh)')?.textContent?.trim();
 if(!en)throw Error('沒有找到題幹。請複製題目的網頁原始碼，或選取整題後複製（包含題號與筆記）。');
 const match=questions.find(q=>normal(q.stem)===normal(en))||questions.find(q=>normal(q.stem).startsWith(normal(en))&&normal(en).length>30);
 if(!match)throw Error('這個題幹不在目前的題庫中，請先確認是 300-410 的同一版題庫。');
 const optionsZh={};for(const row of doc.querySelectorAll('.choice-row')){const label=row.querySelector('.choice-label')?.textContent?.trim().replace('.','');const zh=row.querySelector('.choice-text-zh')?.textContent?.trim();if(/^[A-H]$/.test(label)&&zh)optionsZh[label]=zh;}
 let drag=null;try{drag=JSON.parse(doc.querySelector('#practice-correct-drag')?.textContent||'null');}catch{}
 const raw={id:match.id,stemZh:doc.querySelector('.question-text-zh')?.textContent?.trim()||'',optionsZh,html:doc.querySelector('.note-content')?.innerHTML||'',source:'BGW 原文（使用者複製的網頁）',imported:new Date().toISOString(),english:en,drag};
 if(!raw.stemZh&&!raw.html&&!drag)throw Error('找到了題目，但沒有中文或配對資料。請確認已複製完整的題目原始碼。');
 return validateNotes({[match.id]:raw},questions)[match.id];
}
function mergeNotes(old,incoming){const result={...old};for(const [id,n]of Object.entries(incoming)){const before=result[id]||{};result[id]={...before,...n,stemZh:n.stemZh||before.stemZh||'',html:n.html||before.html||'',optionsZh:{...(before.optionsZh||{}),...(n.optionsZh||{})},...(n.drag||before.drag?{drag:n.drag||before.drag}:{})};}return result;}
const api={cleanLearningReset,learningResetInfo,resetLearning,learningResetRestoreError,restoreLearningReset,cleanLearningEvents,initializeLearning,rebuildLearning,recordPracticeLearning,recordExamLearning,deleteExamLearning,restoreExamLearning,examSelectionSettings,parseQuestionRange,examSelectionError,examSelectionMatches,examSelectionLabel,normal,idOK,shuffled,sameSet,grade,remaining,formatTime,scoring,scoreResult,examSettings,canGrade,recentResults,recordOutcome,scopeMatches,topicFor,topicMatches,analyze,answerComplete,reviewIds,safeHTML,validateNotes,validateBank,parseBGW,mergeNotes,wilsonLower,masteryPolicy,cleanEvidence,addExamEvidence,initializeMastery,masteryStatus,masteryFor,excludeFromExam,validExamDate,examTimeline,selectExamQuestions,samplingInfo,weightedSample,allocateSlots,samplingSnapshot,applySourceCorrections,sameSourceQuestion,sameSourceNote};
if(typeof module!=='undefined'&&module.exports)module.exports=api;root.StudyCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
