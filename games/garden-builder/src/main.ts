import { createIcons, ArrowLeft, House, RotateCcw, RotateCw, Undo2, Redo2, Maximize, Minimize, Volume2, VolumeX, Pause, Play, Settings2, CircleHelp, X, Check, Plus, Minus, LocateFixed, Grid2X2, Scan, Hammer, Paintbrush, Eraser, Sprout, Trophy, ChevronRight, Move, Save } from 'lucide';
import { libraryUrl, recordVisit } from '@toy2game/catalog/browser';
import { Builder, loadSave, save, PREF_KEY } from './game';
import { PARTS, SIZE, BLUEPRINT, landing, samePlacement, nextHint, complete, tasks, placementError, removalError, occupies, type Kind, type Placement } from './rules';
import { GardenScene } from './scene';
import { fullscreenControl } from './fullscreen';
import { GameAudio } from './audio';
import './style.css';

const icons = { ArrowLeft, House, RotateCcw, RotateCw, Undo2, Redo2, Maximize, Minimize, Volume2, VolumeX, Pause, Play, Settings2, CircleHelp, X, Check, Plus, Minus, LocateFixed, Grid2X2, Scan, Hammer, Paintbrush, Eraser, Sprout, Trophy, ChevronRight, Move, Save };
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const icon = (name: string) => `<i data-lucide="${name}"></i>`;
const button = (id: string, name: string, glyph: string) => `<button type="button" class="icon-button" id="${id}" aria-label="${name}" title="${name}" data-tooltip="${name}">${icon(glyph)}</button>`;
const drawIcons = () => createIcons({ icons, attrs: { 'stroke-width': 1.7, 'aria-hidden': 'true' } });
const restored = loadSave();
let game = new Builder(undefined, restored ?? undefined);
let selection: Placement = { ...(nextHint(game.pieces) ?? BLUEPRINT[0]) };
let buttered = false, autoMortar = true, followPlan = false;
let group: 'house' | 'garden' = 'house', erase = false, userPaused = false, failed = false;
let scene: GardenScene | undefined, dialog: HTMLDialogElement | null = null, lastFocus: HTMLElement | null = null;
let toastTimer = 0, disposed = false, busy = false, activePreview = true;
const abort = new AbortController();
const audio = new GameAudio();
try { const prefs = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null'); audio.enabled = prefs?.sound !== false; autoMortar = prefs?.autoMortar !== false; } catch { /* Optional preference. */ }
recordVisit('garden-builder');
$('#app').innerHTML = `
<header class="header">
  <a class="brand" href="${libraryUrl(import.meta.env.BASE_URL)}" aria-label="返回游戏大厅" title="返回游戏大厅">${icon('arrow-left')}<span class="brand-mark">${icon('house')}</span><span><h1>小院建造家</h1><small>GARDEN BUILDER</small></span></a>
  <span class="header-note">一砖一瓦，造个喜欢的家。</span>
  <nav class="header-tools" aria-label="游戏工具">${button('help', '游戏规则', 'circle-help')}${button('sound', '关闭音效', 'volume-2')}${button('fullscreen', '进入全屏', 'maximize')}${button('pause', '暂停游戏', 'pause')}<span class="divider"></span>${button('settings', '游戏设置', 'settings-2')}${button('restart', '新的一局', 'rotate-ccw')}</nav>
</header>
<main class="workspace">
  <section class="studio" aria-label="小院搭建场地">
    <div class="studio-heading"><div><span class="eyebrow">我的小小天地 <span class="dot"></span> 自由搭建</span><h2>把日子，慢慢盖起来。</h2></div><span class="save-state" id="save-state">${icon('save')}<span>${restored ? '已恢复小院' : '进度自动保存'}</span></span></div>
    <div class="scene-wrap"><div id="garden-scene"><div id="loading">正在准备你的小院…</div></div><div class="scene-note">24 × 24 <span>半砖定位格</span></div><div id="tool-indicator" class="tool-indicator"></div><div id="preview-actions" class="preview-actions" role="group" aria-label="旋转、确认或取消当前预览" hidden>${button('rotate-preview', '旋转预览', 'rotate-cw')}${button('confirm-preview', '确认放置', 'check')}${button('cancel-preview', '取消预览', 'x')}</div><div class="view-tools" aria-label="视角工具">${button('view-right', '向右旋转视角', 'rotate-cw')}${button('view-top', '俯视小院', 'scan')}${button('zoom-in', '放大视角', 'plus')}${button('zoom-out', '缩小视角', 'minus')}${button('view-reset', '恢复默认视角', 'locate-fixed')}</div><div id="pause-overlay" hidden><span>${icon('sprout')}</span><h2>让小院歇一会儿</h2><button id="resume" class="primary">继续搭建 ${icon('play')}</button></div></div>
    <div class="build-tools"><div class="tool-group">${button('build-mode', '搭建模式', 'paintbrush')}${button('erase-mode', '拆除模式', 'hammer')}<span class="divider"></span>${button('undo', '撤销一步', 'undo-2')}${button('redo', '重做一步', 'redo-2')}</div><div class="tool-group"><span id="height-readout" class="height-readout">自动落地</span>${button('grid', '显示或隐藏网格', 'grid2-x2')}</div></div>
    <div class="masonry-tools"><button id="hint" class="hint-button">${icon('locate-fixed')} 下一块图纸提示</button><label><input id="follow-plan" type="checkbox" />连续提示</label><label><input id="auto-mortar" type="checkbox" ${autoMortar ? 'checked' : ''} />自动抹浆</label></div><div class="placement-bar"><div class="placement-info"><strong id="selection-title"></strong><span id="placement-status" role="status"></span></div><button id="coordinates" class="coordinate-button" title="精确定位" aria-label="精确定位">${icon('move')}<span id="coordinates-label"></span></button>${button('rotate-part', '旋转部件', 'rotate-cw')}<button id="place" class="primary">放到这里 ${icon('plus')}</button></div>
    <div class="studio-footer"><span>轻触定位 <b>·</b> ✓ 确认／× 取消 <b>·</b> 拖动转视角</span><span><strong id="piece-count">0</strong> 个部件 · 无限灵感</span></div>
  </section>
  <aside class="sidebar" aria-label="物料与小院任务"><div class="shop-heading"><div><span class="eyebrow">THE LITTLE WORKSHOP</span><h2>物料小铺</h2></div><span class="unlimited">∞<small>不限量</small></span></div><div class="tabs" role="group" aria-label="部件分类"><button data-group="house" aria-pressed="true">${icon('house')} 砖瓦材料</button><button data-group="garden" aria-pressed="false">${icon('sprout')} 庭院配件</button></div><div id="parts" class="parts" role="group" aria-label="选择部件"></div><p id="part-description" class="part-description"></p>
  <details class="mission" open><summary><span>${icon('sprout')} 小院心愿单</span><strong id="task-count">0 / 5</strong></summary><p>不赶时间，慢慢实现每个小心愿。</p><div id="tasks"></div><button class="finish-button" id="finish">${icon('check')} 完成作品 <span id="finish-count"></span></button></details></aside>
</main>
<dialog id="help-dialog" aria-labelledby="help-title"><div class="dialog-top"><span class="eyebrow">BRICK BY BRICK</span>${button('close-help', '关闭规则', 'x')}</div><h2 id="help-title">像小泥瓦匠一样造房子</h2><ol class="guide"><li><strong>真正从一块砖开始</strong><p>整砖占 2 × 1 格，半砖占 1 格。一皮是一层砖；R 旋转方向，用半砖错缝收边。没有整面墙或成品房屋。</p></li><li><strong>抹浆，然后放砖</strong><p>默认自动抹浆。单击定位，点透明预览旁的 ✓ 确认、× 取消，也可双击／双触预览，或点“放到这里”，泥刀刮平砂浆后自动放砖。关闭自动抹浆时，先抹浆再放砖。</p></li><li><strong>门窗和屋瓦单独安装</strong><p>预留门窗洞，放入独立框架，再接着砌墙。过梁两端需要支撑；斜瓦从檐口向中间一片片搭接，最后铺屋脊瓦。</p></li><li><strong>菜畦和池岸也自己砌</strong><p>先围出四条砖边，菜畦内空 2 × 2 格，鱼池内空 4 × 2 格，再填土或放入内胆。</p></li><li><strong>自由创作，也有参考图纸</strong><p>点空地从底层搭，点已有砖块继续垒高，高度按下方材料自动确定。图纸只是可选参考；自己选位置或材料就退出连续提示。五项材料工序达标后可验收，不强制照图完成。</p></li></ol><p class="muted">轻触选位置 · 拖动转视角 · 双指移动／缩放 · 鼠标右键拖动平移 · 方向键定位。吸附、抹浆和支撑是数字版简化，不模拟真实砂浆固化与受力。</p><button class="primary wide" data-close>开始砌砖 ${icon('hammer')}</button></dialog>
<dialog id="settings-dialog" aria-labelledby="settings-title"><form id="settings-form"><div class="dialog-top"><span class="eyebrow">A FRESH START</span>${button('close-settings', '关闭设置', 'x')}</div><h2 id="settings-title">游戏设置</h2><p>选一块地，重新开始你的创作。</p><fieldset><legend>开局地块</legend><label class="template-option"><input type="radio" name="template" value="starter" /><span><strong>砌了地基的小院</strong><small>已砌少量基础砖，接着逐块垒高。</small></span></label><label class="template-option"><input type="radio" name="template" value="empty" /><span><strong>一张空白画布</strong><small>空白地块，从第一块砖开始创造。</small></span></label></fieldset><p class="muted">确认会替换当前作品；关闭设置保留当前进度。</p><button type="submit" class="primary wide">按此设置开始新局 ${icon('arrow-left')}</button></form></dialog>
<dialog id="restart-dialog" aria-labelledby="restart-title"><div class="dialog-top"><span class="eyebrow">START AGAIN</span>${button('close-restart', '取消重开', 'x')}</div><h2 id="restart-title">重新开始这一局？</h2><p>当前作品会被清空，按已生效的开局地块重新开始。</p><div class="dialog-actions"><button data-close class="secondary">继续这局</button><button id="confirm-restart" class="primary">重新开局 ${icon('rotate-ccw')}</button></div></dialog>
<dialog id="coordinates-dialog" aria-labelledby="coordinates-title"><form id="coordinates-form"><div class="dialog-top"><span class="eyebrow">FIND YOUR SPOT</span>${button('close-coordinates', '关闭定位', 'x')}</div><h2 id="coordinates-title">精确定位</h2><p>列从左到右，行从后到前；多格材料以左后角定位。高度由下方材料自动决定。</p><div class="coordinate-fields"><label>列<select id="column" aria-label="放置列">${Array.from({ length: SIZE }, (_, i) => `<option value="${i}">${String.fromCharCode(65 + i)}</option>`).join('')}</select></label><label>行<select id="row" aria-label="放置行">${Array.from({ length: SIZE }, (_, i) => `<option value="${i}">${i + 1}</option>`).join('')}</select></label></div><button type="submit" class="primary wide">选中这个位置 ${icon('check')}</button></form></dialog>
<dialog id="result-dialog" aria-labelledby="result-title"><div class="dialog-top"><span class="eyebrow">HOME, SWEET HOME</span>${button('close-result', '继续搭建', 'x')}</div><div class="result-mark">${icon('house')}</div><h2 id="result-title">小院落成，生活开场。</h2><p>五个小心愿，都有了自己的位置。<br />这座小院，有你喜欢的模样。</p><div id="result-stats"></div><button data-close class="primary wide">再欣赏一会儿 ${icon('sprout')}</button><button id="play-again" class="secondary wide">再来一局 ${icon('rotate-ccw')}</button></dialog>
<div id="toast" role="status" hidden></div>`;

const paused = () => userPaused || document.hidden || !!dialog || failed || disposed;
const locked = () => paused() || busy;
function freePlacement() { activePreview = true; followPlan = false; $<HTMLInputElement>('#follow-plan').checked = false; buttered = false; if (!erase) selection = landing(game.pieces, selection); }
function preferences() { try { localStorage.setItem(PREF_KEY, JSON.stringify({ sound: audio.enabled, autoMortar })); } catch { /* Optional preferences. */ } }
function listen(id: string, fn: (e: Event) => void) { $(id).addEventListener('click', fn, { signal: abort.signal }); }
function notify(text: string) {
  window.clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').hidden = false;
  toastTimer = window.setTimeout(() => { $('#toast').hidden = true; }, 3500);
}
function persist() {
  const okay = save(game.state);
  $('#save-state span').textContent = okay ? '已保存到此浏览器' : '未保存 · 存储不可用';
}
function syncPause() {
  scene?.setPaused(paused()); audio.suspend(paused());
  $('#pause-overlay').hidden = !userPaused;
  const label = userPaused ? '继续游戏' : '暂停游戏';
  $('#pause').setAttribute('aria-label', label); $('#pause').title = label; $('#pause').innerHTML = icon(userPaused ? 'play' : 'pause');
  renderSelection();
}
function open(id: string) {
  lastFocus = document.activeElement as HTMLElement; dialog = $<HTMLDialogElement>(id); dialog.showModal(); syncPause();
}
function close() {
  const old = dialog; dialog = null; old?.close(); syncPause();
  (lastFocus?.isConnected ? lastFocus : $('#help')).focus();
}
function selectedPiece() { return game.pieces.find(p => occupies(p, selection.x, selection.z, selection.y)); }
function renderSelection() {
  const part = PARTS[selection.kind], target = selectedPiece();
  const error = erase ? target ? removalError(game.pieces, target.id) : '轻触一个部件，选中后再拆除' : placementError(game.pieces, selection);
  $('#selection-title').textContent = erase ? `拆除 · ${target ? PARTS[target.kind].name : '选择部件'}` : part.name;
  $('#placement-status').textContent = !activePreview ? '轻触场地，选择新的位置' : busy ? '泥刀抹浆中…' : error ?? (erase ? '可安全拆除，随时可以撤销' : part.mortar && !buttered && !autoMortar ? '位置合适，先抹一层砂浆' : part.mortar ? buttered ? '砂浆已就位，可以放砖了' : '点 ✓ 确认 · 自动抹浆'  : '位置合适，准备放下');
  $('#placement-status').classList.toggle('invalid', !!error);
  $('#coordinates-label').textContent = `${String.fromCharCode(65 + selection.x)}${selection.z + 1}`;
  $('#height-readout').textContent = selection.y === 0 ? '自动落地' : `自动叠高 · 第 ${selection.y + 1} 皮`;
  $('#tool-indicator').innerHTML = `${icon(erase ? 'hammer' : 'paintbrush')}<span>${erase ? '拆除锤 · 点 ✓ 拆除' : busy ? '泥刀正在抹浆…' : '泥刀 · 点 ✓ 放砖'}</span>`;
  $('#tool-indicator').dataset.mode = erase ? 'demolish' : 'build';
  $('#garden-scene').setAttribute('aria-busy', String(busy));
  const cannotPlace = locked() || !activePreview || !!error;
  $<HTMLButtonElement>('#place').disabled = cannotPlace;
  const confirm = $<HTMLButtonElement>('#confirm-preview'); confirm.disabled = cannotPlace;
  const confirmLabel = erase ? '确认拆除' : '确认放置'; confirm.setAttribute('aria-label', confirmLabel); confirm.title = confirmLabel; confirm.dataset.tooltip = confirmLabel;
  $('#preview-actions').dataset.mode = erase ? 'demolish' : 'build';
  $('#place').innerHTML = busy ? `正在抹浆… ${icon('paintbrush')}` : erase ? `拆除材料 ${icon('hammer')}` : part.mortar && !buttered && !autoMortar ? `抹一层砂浆 ${icon('hammer')}` : `放到这里 ${icon('plus')}`;
  $<HTMLButtonElement>('#rotate-part').disabled = locked() || erase;
  $('#rotate-part').title = `旋转部件 · 当前 ${selection.rotation * 90}°`;
  const rotatePreview = $<HTMLButtonElement>('#rotate-preview');
  rotatePreview.hidden = erase; rotatePreview.disabled = locked();
  rotatePreview.title = `旋转预览 90° · 当前 ${selection.rotation * 90}°`; rotatePreview.dataset.tooltip = rotatePreview.title;
  $<HTMLButtonElement>('#undo').disabled = locked() || !game.state.past.length;
  $<HTMLButtonElement>('#redo').disabled = locked() || !game.state.future.length;

  $<HTMLInputElement>('#follow-plan').disabled = locked(); $<HTMLInputElement>('#auto-mortar').disabled = locked();
  for (const id of ['build-mode', 'erase-mode', 'coordinates', 'hint']) $<HTMLButtonElement>(`#${id}`).disabled = locked();
  $('#build-mode').setAttribute('aria-pressed', String(!erase)); $('#erase-mode').setAttribute('aria-pressed', String(erase));
  const done = tasks(game.pieces).filter(t => t.value === t.target).length;
  $<HTMLButtonElement>('#finish').disabled = locked() || done < 5;
  if (activePreview) scene?.preview(erase && target ? target : selection, !error, erase, erase ? !target : error?.includes('已有材料'), buttered);
  else scene?.clearPreview();
  drawIcons();
}
function renderParts() {
  $('#parts').innerHTML = (Object.keys(PARTS) as Kind[]).filter(kind => (PARTS[kind].group === 'garden') === (group === 'garden')).map(kind => `<button class="part" data-part="${kind}" aria-label="选择${PARTS[kind].name}" aria-pressed="${kind === selection.kind && !erase}"><span class="part-preview">${scene ? `<img src="${scene.thumbnails[kind]}" alt="" />` : icon('house')}</span><span>${PARTS[kind].name}</span><small>${PARTS[kind].w} × ${PARTS[kind].d}</small><span class="part-check">${icon('check')}</span></button>`).join('');
  $('#part-description').textContent = PARTS[selection.kind].description;
  document.querySelectorAll<HTMLButtonElement>('[data-group]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.group === group))); drawIcons();
}
function render() {
  $('#piece-count').textContent = String(game.pieces.length);
  const goals = tasks(game.pieces), done = goals.filter(t => t.value === t.target).length;
  $('#task-count').textContent = `${done} / 5`; $('#finish-count').textContent = `${done}/5`;
  $('#tasks').innerHTML = goals.map(t => `<div class="task ${t.value === t.target ? 'done' : ''}" title="${t.hint}"><span class="task-check">${t.value === t.target ? icon('check') : ''}</span><span>${t.name}</span><small>${t.value} / ${t.target}</small></div>`).join('');
  renderSelection();
}
function changed() { scene?.sync(game.pieces); render(); persist(); }
function place() {
  if (locked() || !activePreview) return;
  audio.unlock();
  const target = selectedPiece(), pending = { ...selection };
  const error = erase ? target ? removalError(game.pieces, target.id) : '请先选中材料' : placementError(game.pieces, pending);
  if (error) { notify(error); return; }
  const commit = () => {
    busy = false;
    const error = erase ? game.remove(target!.id) : game.place(pending, true);
    if (error) { notify(error); renderSelection(); return; }
    audio.play(erase ? 'miss' : 'flip'); buttered = false;
    if (!erase && followPlan) applyHint(false);
    else if (!erase) selection = landing(game.pieces, pending);
    changed();
    if (complete(game.pieces)) notify('五个小心愿已实现，可以完成作品啦');
  };
  if (!erase && PARTS[pending.kind].mortar && !buttered && scene) {
    busy = true;
    scene.animateMortar(pending, autoMortar, () => {
      busy = false;
      if (autoMortar) commit();
      else { buttered = true; audio.play('flip'); renderSelection(); }
    });
    renderSelection();
  } else commit();
}
function choose(kind: Kind) {
  if (locked()) return;
  selection.kind = kind; erase = false; buttered = false;
  freePlacement();
  renderParts(); renderSelection();
}
function newGame(template = game.state.settings.template) {
  scene?.cancelAnimation(); busy = false; activePreview = true;
  game = new Builder({ template }); selection = { ...(nextHint(game.pieces) ?? BLUEPRINT[0]) }; buttered = false;
  erase = false; userPaused = false; group = 'house'; followPlan = false; $<HTMLInputElement>('#follow-plan').checked = false; close(); scene?.resetView(); changed(); renderParts();
}
function requestRestart() {
  if (game.state.edited && !game.state.current.finished) open('#restart-dialog'); else newGame();
}
function fatal() {
  failed = true; scene?.setPaused(true);
  $('#garden-scene').innerHTML = `<div class="scene-error"><h2>小院暂时无法显示</h2><p>需要支持 WebGL 的浏览器。请刷新或尝试关闭其他占用图形资源的页面。</p><button class="primary" id="reload">重新加载</button></div>`;
  listen('#reload', () => location.reload()); renderSelection();
}
try {
  scene = new GardenScene($('#garden-scene'), { select: (x, z, id) => {
    if (locked()) return;
    const previous = { ...selection }, prepared = buttered;
    if (id !== undefined) { const p = game.pieces.find(p => p.id === id); if (p) { selection.x = p.x; selection.z = p.z; selection.y = p.y; } }
    else { selection.x = x; selection.z = z; }
    freePlacement(); if (samePlacement(previous, selection)) buttered = prepared; renderParts(); renderSelection();
  }, place, error: fatal }, $('#preview-actions'));
  $('#loading').remove(); scene.sync(game.pieces);
} catch { fatal(); }
const disposeFullscreen = fullscreenControl($<HTMLButtonElement>('#fullscreen'), active => {
  $('#fullscreen').innerHTML = icon(active ? 'minimize' : 'maximize'); $('#fullscreen').title = active ? '退出全屏' : '进入全屏'; drawIcons();
}, () => notify('暂时无法切换全屏，请稍后再试'));

function applyHint(report = true) {
  const hint = nextHint(game.pieces);
  if (!hint) { if (report) notify('参考图纸已完成，或剩余位置被作品占用；可以继续自由搭建'); return; }
  activePreview = true; selection = { ...hint }; erase = false; buttered = false; group = PARTS[hint.kind].group === 'garden' ? 'garden' : 'house';
  if (report) notify(`图纸提示：${PARTS[hint.kind].name} · 第 ${hint.y + 1} 皮`);
  renderParts(); renderSelection();
}
listen('#hint', () => { if (!locked()) applyHint(); });
$('#follow-plan').addEventListener('change', () => { followPlan = $<HTMLInputElement>('#follow-plan').checked; if (followPlan) applyHint(); }, { signal: abort.signal });
$('#auto-mortar').addEventListener('change', () => { autoMortar = $<HTMLInputElement>('#auto-mortar').checked; preferences(); renderSelection(); }, { signal: abort.signal });
listen('#place', place);
listen('#confirm-preview', place);
listen('#cancel-preview', () => { if (!locked()) { activePreview = false; buttered = false; renderSelection(); $(erase ? '#erase-mode' : '#build-mode').focus(); } });
listen('#build-mode', () => { if (!locked()) { erase = false; freePlacement(); renderParts(); renderSelection(); } });
listen('#erase-mode', () => { if (!locked()) { erase = true; freePlacement(); renderParts(); renderSelection(); } });
listen('#undo', () => { if (!locked()) { game.undo(); if (!erase) selection = landing(game.pieces, selection); changed(); } });
listen('#redo', () => { if (!locked()) { game.redo(); if (!erase) selection = landing(game.pieces, selection); changed(); } });
function rotatePart() {
  if (locked() || erase) return;
  selection.rotation = (selection.rotation + 1) % 4; freePlacement(); renderSelection();
}
listen('#rotate-part', rotatePart);
listen('#rotate-preview', rotatePart);
$('#parts').addEventListener('click', e => { const target = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-part]'); if (target) choose(target.dataset.part as Kind); }, { signal: abort.signal });
document.querySelectorAll<HTMLButtonElement>('[data-group]').forEach(b => b.addEventListener('click', () => { if (locked()) return; group = b.dataset.group as typeof group; renderParts(); }, { signal: abort.signal }));
listen('#coordinates', () => {
  $<HTMLSelectElement>('#column').value = String(selection.x); $<HTMLSelectElement>('#row').value = String(selection.z); open('#coordinates-dialog');
});
$('#coordinates-form').addEventListener('submit', e => {
  e.preventDefault(); selection.x = Number($<HTMLSelectElement>('#column').value); selection.z = Number($<HTMLSelectElement>('#row').value); if (erase) { const target = game.pieces.filter(p => occupies(p, selection.x, selection.z)).sort((a, b) => b.y - a.y)[0]; selection.y = target?.y ?? 0; } freePlacement(); close(); renderSelection();
}, { signal: abort.signal });
listen('#help', () => open('#help-dialog'));
listen('#settings', () => { $<HTMLInputElement>(`input[name="template"][value="${game.state.settings.template}"]`).checked = true; open('#settings-dialog'); });
$('#settings-form').addEventListener('submit', e => { e.preventDefault(); newGame($<HTMLInputElement>('input[name="template"]:checked').value as 'starter' | 'empty'); }, { signal: abort.signal });
listen('#restart', requestRestart); listen('#confirm-restart', () => newGame()); listen('#play-again', () => newGame());
for (const id of ['help', 'settings', 'restart', 'coordinates', 'result']) listen(`#close-${id}`, close);
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close, { signal: abort.signal }));
document.querySelectorAll('dialog').forEach(d => d.addEventListener('cancel', e => { e.preventDefault(); close(); }, { signal: abort.signal }));
listen('#pause', () => { userPaused = !userPaused; syncPause(); }); listen('#resume', () => { userPaused = false; syncPause(); });
listen('#finish', () => {
  if (locked() || !complete(game.pieces)) return;
  game.state.current.finished = true; persist(); audio.unlock(); audio.play('win');
  $('#result-stats').innerHTML = `<strong>${game.pieces.length}<small>个小院部件</small></strong><strong>5 / 5<small>个实现的小心愿</small></strong>`; open('#result-dialog');
});
function soundLabel() {
  const label = audio.enabled ? '关闭音效' : '开启音效'; $('#sound').setAttribute('aria-label', label); $('#sound').title = label; $('#sound').innerHTML = icon(audio.enabled ? 'volume-2' : 'volume-x'); drawIcons();
}
listen('#sound', () => {
  audio.enabled = !audio.enabled; if (audio.enabled) audio.unlock(); else audio.suspend(true);
  preferences(); soundLabel();
});
listen('#view-right', () => { if (!locked()) scene?.rotate(); }); listen('#view-top', () => { if (!locked()) scene?.top(); });
listen('#view-reset', () => { if (!locked()) scene?.resetView(); }); listen('#zoom-in', () => { if (!locked()) scene?.zoom(0.2); }); listen('#zoom-out', () => { if (!locked()) scene?.zoom(-0.2); });
$('#grid').setAttribute('aria-pressed', 'true'); listen('#grid', () => { if (!locked()) $('#grid').setAttribute('aria-pressed', String(scene?.toggleGrid())); });
document.addEventListener('visibilitychange', syncPause, { signal: abort.signal });
document.addEventListener('keydown', e => {
  if (locked() || (e.target as HTMLElement).closest('input, select, textarea')) return;
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); if (e.shiftKey) game.redo(); else game.undo(); if (!erase) selection = landing(game.pieces, selection); changed(); }
  else if (key === 'r') rotatePart();
  else if (key === 'enter' && !(e.target as HTMLElement).closest('button, a')) { e.preventDefault(); place(); }
  else if (key === 'delete') { erase = true; freePlacement(); renderParts(); renderSelection(); }
  else if (key.startsWith('arrow')) {
    e.preventDefault(); if (key === 'arrowleft') selection.x--; if (key === 'arrowright') selection.x++; if (key === 'arrowup') selection.z--; if (key === 'arrowdown') selection.z++;
    buttered = false; selection.x = Math.max(0, Math.min(SIZE - 1, selection.x)); selection.z = Math.max(0, Math.min(SIZE - 1, selection.z)); freePlacement(); renderSelection();
  }
}, { signal: abort.signal });
renderParts(); render(); soundLabel(); syncPause();
if (import.meta.env.DEV) Object.assign(window, { __garden: { get game() { return game; }, get selection() { return selection; }, get scene() { return scene; } } });
function dispose() { if (disposed) return; disposed = true; abort.abort(); clearTimeout(toastTimer); disposeFullscreen(); audio.dispose(); scene?.dispose(); }
window.addEventListener('pagehide', e => { if (!(e as PageTransitionEvent).persisted) dispose(); else scene?.setPaused(true); });
window.addEventListener('pageshow', () => { if (!disposed) syncPause(); });
if (import.meta.hot) import.meta.hot.dispose(dispose);
