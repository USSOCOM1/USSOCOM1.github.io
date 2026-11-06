/* USSOCOM website. Public pages render data/public.json (published by SEC WAR).
   The members area signs in with Discord through the Cloudflare Worker and
   renders the members document it returns. No build step. */
(() => {
  'use strict';

  const CONFIG = Object.assign({ workerUrl: '', dataUrl: 'data/public.json' }, window.USSOCOM_CONFIG || {});
  const SESSION_KEY = 'ussocom.session';
  const main = document.getElementById('main');
  let data = null;
  let members = null;
  let media = null;

  // ---------------------------------------------------------------- helpers
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (strings, ...values) => strings.reduce((out, s, i) => out + s + (i < values.length ? values[i] : ''), '');
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const fmtDate = (iso, opts) => (iso ? new Date(iso).toLocaleString(undefined, opts) : '');
  const when = (iso) => fmtDate(iso, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const day = (iso) => fmtDate(iso, { year: 'numeric', month: 'short', day: 'numeric' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const unitByKey = (k) => (data?.units || []).find((u) => u.key === k);
  const unitStyle = (u) => `--unit:${esc(u?.color || '#c9a227')}`;

  const UNIT_COPY = {
    cag: {
      blurb: 'A Squadron runs direct action and special reconnaissance in small, self-contained teams. Close quarters battle, precision marksmanship, breaching.',
      course: 'Operator Training Course: CQB, marksmanship, breaching and special reconnaissance.',
      layout: 'Squadron HQ (X01, X02), 1 Troop Team A (XA1–XA6) and Team B (XB1–XB6), 3 Troop Team I recce (XI1–XI6). The seat code is the callsign.',
    },
    rgr: {
      blurb: 'The large-scale raid and airfield seizure force. Platoon-level operations with rifle squads and a weapons squad.',
      course: 'No unit course. Pass RASP and you are a Ranger; Ranger School is the follow-on leadership course and earns the Ranger Tab.',
      layout: 'Platoon "Bulldog": Bulldog 6 platoon leader, Bulldog 7 platoon sergeant, Bulldog 1–3 rifle squads, Bulldog 4 weapons squad.',
    },
    seal: {
      blurb: 'Maritime special operations: combat diving, VBSS, coastal raids and direct action from the sea.',
      course: 'SEAL Qualification Training: maritime operations, combat diving, VBSS and direct action. Graduates earn the SEAL Trident.',
      layout: 'Echo Platoon: Echo 6 OIC, Echo 5 AOIC, Echo 7 platoon chief, Echo 8 LPO, fire teams Echo 1-x, 2-x, 3-x.',
    },
    mrb: {
      blurb: 'Marine Special Operations Teams built for direct action, special reconnaissance and irregular warfare, with organic fires and medical.',
      course: 'Individual Training Course: CQB, special reconnaissance, fires, comms, medical and irregular warfare. Graduates earn the title Marine Raider.',
      layout: 'Battalion HQ Raider 6/5/7/3 and MSOT 8311 "Apache": Apache 6 team commander, Apache 7 team chief, element leaders, CSOs and SARC.',
    },
  };

  const setTitle = (t) => { document.title = t ? `${t} | USSOCOM` : 'USSOCOM | Arma Reforger Milsim'; };
  const discordButton = (label = 'Join the Discord') => (data?.discordInvite
    ? `<a class="btn discord" href="${esc(data.discordInvite)}" target="_blank" rel="noopener">${esc(label)}</a>`
    : '');

  // ---------------------------------------------------------------- public pages
  function unitCard(u) {
    const fill = pct(u.orbat.filled, u.orbat.seats);
    return h`
      <a class="card unit" style="${unitStyle(u)}" href="#/units/${esc(u.key)}">
        <div class="parent">${esc(u.parent)} · ${esc(u.service)}</div>
        <h3>${esc(u.display)}</h3>
        <div class="muted">${esc(UNIT_COPY[u.key]?.blurb || u.element)}</div>
        ${u.motto ? `<em class="muted">“${esc(u.motto)}”</em>` : ''}
        <div class="meta">
          <span>${u.orbat.filled}/${u.orbat.seats} seats filled</span>
          <span class="badge ${u.recruiting ? 'open' : 'closed'}">${u.recruiting ? 'Recruiting' : 'Closed'}</span>
        </div>
        <div class="bar"><i style="width:${fill}%"></i></div>
      </a>`;
  }

  function nextEvents(list, n) {
    if (!list.length) return '<div class="empty">Nothing scheduled yet. Check the Discord for the weekly schedule.</div>';
    return `<div class="events">${list.slice(0, n).map(eventRow).join('')}</div>`;
  }

  function eventRow(e) {
    const d = new Date(e.start);
    return h`
      <article class="event">
        <div class="date"><span>${esc(d.toLocaleString(undefined, { month: 'short' }))}</span><b>${d.getDate()}</b><span>${esc(d.toLocaleString(undefined, { weekday: 'short' }))}</span></div>
        <div>
          <h3>${esc(e.name)}</h3>
          <div class="muted">${esc(fmtDate(e.start, { hour: '2-digit', minute: '2-digit' }))}${e.end ? ` – ${esc(fmtDate(e.end, { hour: '2-digit', minute: '2-digit' }))}` : ''} · <span class="badge gold">${esc(e.type)}</span></div>
          ${e.description ? `<p>${esc(e.description)}</p>` : ''}
        </div>
      </article>`;
  }

  function pageHome() {
    setTitle('');
    const s = data.stats;
    return h`
      <div class="hero">
        <div>
          <div class="eyebrow">${esc(data.unit.game)} milsim</div>
          <h1>${esc(data.unit.name)}</h1>
          <p class="motto">${esc(data.unit.motto)}</p>
          <p class="lead">Four special operations units under their real-world parent commands, each with its own ranks, leadership and standards. Apply to the unit you want and earn your place through its own selection.</p>
          <div class="actions">
            <a class="btn primary" href="#/join">Enlist</a>
            ${discordButton()}
            <a class="btn" href="#/orbat">View the ORBAT</a>
          </div>
        </div>
        <img src="assets/ussocom.png" alt="USSOCOM emblem">
      </div>
      <div class="stats">
        <div class="stat"><b>${s.members}</b><span>Rostered members</span></div>
        <div class="stat"><b>${s.units}</b><span>Component units</span></div>
        <div class="stat"><b>${s.filled}/${s.seats}</b><span>Seats filled</span></div>
        <div class="stat"><b>${s.open}</b><span>Open seats</span></div>
      </div>
      <section>
        <div class="section-head"><div><div class="eyebrow">Order of battle</div><h2>The units</h2></div><a href="#/units">All units →</a></div>
        <div class="grid units">${data.units.map(unitCard).join('')}</div>
      </section>
      ${mediaStrip(8)}
      <section class="two">
        <div>
          <div class="section-head"><div><div class="eyebrow">Coming up</div><h2>Schedule</h2></div><a href="#/schedule">Full schedule →</a></div>
          ${nextEvents(data.upcoming, 4)}
        </div>
        <div>
          <div class="section-head"><div><div class="eyebrow">How you get in</div><h2>Selection</h2></div><a href="#/pipeline">Details →</a></div>
          <div class="panel">
            <ol class="checklist">
              <li><b>Apply</b> to one unit with <code>/enlist</code> in the Discord.</li>
              <li><b>Its selection</b>: ${data.units.filter((u) => u.recruiting).map((u) => esc(u.selectionShort)).join(', ')}, run by the unit's command and Instructor Cadre.</li>
              <li><b>Its course</b>, then you serve as one of its operators.</li>
            </ol>
          </div>
        </div>
      </section>`;
  }

  // ---------------------------------------------------------------- media
  const mediaItems = () => media?.items ?? [];
  const mediaThumb = (item, i) => h`
    <button class="shot" data-media="${i}" aria-label="Open picture ${i + 1}">
      <img src="${esc(item.thumb)}" alt="Screenshot from the USSOCOM media channel" loading="lazy" width="${item.width || ''}" height="${item.height || ''}">
    </button>`;

  function mediaStrip(n) {
    const items = mediaItems();
    if (!items.length) return '';
    return h`
      <section>
        <div class="section-head"><div><div class="eyebrow">From the field</div><h2>Media</h2></div><a href="#/media">All media →</a></div>
        <div class="gallery strip">${items.slice(0, n).map(mediaThumb).join('')}</div>
      </section>`;
  }

  function pageMedia() {
    setTitle('Media');
    const items = mediaItems();
    return h`
      <section>
        <div class="eyebrow">From the field</div>
        <h1>Media</h1>
        <p class="lead">The latest screenshots from our ops and training, straight from the Discord's media channel.</p>
        ${items.length ? `<div class="gallery">${items.map(mediaThumb).join('')}</div>` : '<div class="empty">No pictures yet.</div>'}
      </section>`;
  }

  let viewer = null;
  function openViewer(index) {
    const items = mediaItems();
    if (!items.length) return;
    if (!viewer) {
      viewer = document.createElement('div');
      viewer.className = 'viewer';
      viewer.setAttribute('role', 'dialog');
      viewer.setAttribute('aria-modal', 'true');
      viewer.innerHTML = '<button class="v-close" aria-label="Close">×</button><button class="v-prev" aria-label="Previous">‹</button>'
        + '<figure><img alt="Screenshot from the USSOCOM media channel"><figcaption></figcaption></figure><button class="v-next" aria-label="Next">›</button>';
      document.body.appendChild(viewer);
      const move = (d) => show((viewer.index + d + mediaItems().length) % mediaItems().length);
      viewer.querySelector('.v-close').addEventListener('click', closeViewer);
      viewer.querySelector('.v-prev').addEventListener('click', () => move(-1));
      viewer.querySelector('.v-next').addEventListener('click', () => move(1));
      viewer.addEventListener('click', (e) => { if (e.target === viewer) closeViewer(); });
      document.addEventListener('keydown', (e) => {
        if (!viewer.classList.contains('open')) return;
        if (e.key === 'Escape') closeViewer();
        if (e.key === 'ArrowLeft') move(-1);
        if (e.key === 'ArrowRight') move(1);
      });
    }
    const show = (i) => {
      const item = mediaItems()[i];
      viewer.index = i;
      viewer.querySelector('img').src = item.src;
      viewer.querySelector('figcaption').textContent = `${day(item.posted)} · ${i + 1} of ${mediaItems().length}`;
    };
    show(index);
    viewer.classList.add('open');
    document.body.classList.add('no-scroll');
    viewer.querySelector('.v-close').focus();
  }
  function closeViewer() {
    viewer?.classList.remove('open');
    document.body.classList.remove('no-scroll');
  }
  function wireMedia() {
    document.querySelectorAll('[data-media]').forEach((b) => b.addEventListener('click', () => openViewer(Number(b.dataset.media))));
  }

  function pageUnits() {
    setTitle('Units');
    return h`
      <section>
        <div class="eyebrow">Order of battle</div>
        <h1>Units</h1>
        <p class="lead">Each unit serves under its real parent command. Rank and command authority stop at the unit's edge: a Ranger sergeant does not command SEALs.</p>
        <div class="grid units">${data.units.map(unitCard).join('')}</div>
      </section>
      <section>
        <div class="section-head"><div><div class="eyebrow">Joint headquarters</div><h2>USSOCOM HQ · ${esc(data.unit.callsign)}</h2></div></div>
        ${orbatElements(data.hq)}
      </section>`;
  }

  function pageUnit(key) {
    const u = unitByKey(key);
    if (!u) return notFound();
    setTitle(u.display);
    const copy = UNIT_COPY[u.key] || {};
    const track = ['Apply', ...u.stages.map((s) => s.value)];
    return h`
      <section class="orbat-unit" style="${unitStyle(u)}">
        <div class="eyebrow">${esc(u.parentName)} · ${esc(u.service)}</div>
        <h1>${esc(u.display)}</h1>
        ${u.motto ? `<p class="motto" style="color:var(--gold2);font-style:italic">“${esc(u.motto)}”</p>` : ''}
        <p class="lead">${esc(copy.blurb || '')}</p>
        <div class="stats">
          <div class="stat"><b>${u.orbat.filled}/${u.orbat.seats}</b><span>Seats filled</span></div>
          <div class="stat"><b>${u.open}</b><span>Open seats</span></div>
          <div class="stat"><b>${esc(u.callsign)}</b><span>Callsign</span></div>
          <div class="stat"><b><span class="badge ${u.recruiting ? 'open' : 'closed'}" style="font-size:.8rem">${u.recruiting ? 'Recruiting' : 'Closed'}</span></b><span>Status</span></div>
        </div>
      </section>
      <section class="two">
        <div class="panel">
          <h3>Joining</h3>
          <p><span class="mono">${track.map(esc).join(' → ')}</span></p>
          <p>Selection: <b>${esc(u.selection)}</b>${u.selectionShort !== u.selection ? ` (${esc(u.selectionShort)})` : ''}, run by ${esc(u.short)} command and Instructor Cadre.</p>
          <p class="muted">${esc(copy.course || '')}</p>
        </div>
        <div class="panel">
          <h3>Structure</h3>
          <p class="muted">${esc(copy.layout || u.element)}</p>
        </div>
      </section>
      <section>
        <div class="section-head"><h2>ORBAT</h2><span class="muted">Live from the roster</span></div>
        ${orbatElements(u.orbat)}
      </section>`;
  }

  function seatRow(seat, { named = false } = {}) {
    const o = seat.occupant;
    const who = o ? `${esc(o.rank)} ${esc(o.name)}` : 'Vacant';
    return h`
      <div class="seat${seat.leader ? ' lead' : ''}">
        <span class="cs">${esc(seat.callsign)}</span>
        <span>${esc(seat.billet)}<span class="billet">${esc(seat.id)} · req. ${esc(seat.reqRank)}</span></span>
        <span class="who${o ? '' : ' vacant'}">${named && o?.id ? `<a href="#/members/person/${esc(o.id)}">${who}</a>` : who}</span>
      </div>`;
  }

  function orbatElements(orbat, opts) {
    return `<div class="elements">${orbat.elements.map((e) => h`
      <div class="element">
        <h3><span>${esc(e.name)}</span><span class="muted">${e.seats.filter((s) => s.occupant).length}/${e.seats.length}</span></h3>
        ${e.seats.map((s) => seatRow(s, opts)).join('')}
      </div>`).join('')}</div>`;
  }

  function pageOrbat() {
    setTitle('ORBAT');
    return h`
      <section>
        <div class="eyebrow">Order of battle</div>
        <h1>ORBAT</h1>
        <p class="lead">Every seat in the milsim, filled straight from the USSOCOM roster. Vacant seats are open to new graduates and promotions.</p>
      </section>
      <section class="orbat-unit">
        <header><h2>USSOCOM HQ</h2><span class="muted">${data.hq.filled}/${data.hq.seats} · callsign ${esc(data.unit.callsign)}</span></header>
        ${orbatElements(data.hq)}
      </section>
      ${data.units.map((u) => h`
        <section class="orbat-unit" style="${unitStyle(u)}">
          <header><h2>${esc(u.display)}</h2><span class="muted">${esc(u.parent)} · ${u.orbat.filled}/${u.orbat.seats}</span>
            <span class="badge ${u.recruiting ? 'open' : 'closed'}">${u.recruiting ? 'Recruiting' : 'Closed'}</span></header>
          ${orbatElements(u.orbat)}
        </section>`).join('')}`;
  }

  function pagePipeline() {
    setTitle('Selection');
    return h`
      <section>
        <div class="eyebrow">How you get in</div>
        <h1>Selection</h1>
        <p class="lead">Every unit runs its own selection. Apply to the unit you want; its command and Instructor Cadre assess you against its standard.</p>
        <div class="steps four">
          <div class="step"><h3>Apply</h3><p>Type <code>/enlist</code> in the Discord and pick the unit you want to join. A recruiter reviews it, usually within a day or two.</p></div>
          <div class="step"><h3>Unit selection</h3><p>Fieldcraft, judgement, teamwork under pressure, shooting and movement, medical (MARCH and a 9-line) and leadership when you're put in charge. Each unit adds its own focus.</p></div>
          <div class="step"><h3>Unit course</h3><p>Pass and you take the unit's course. The 75th has none: pass RASP and you are a Ranger.</p></div>
          <div class="step"><h3>Operator</h3><p>Graduate and take a seat on the ORBAT. Didn't pass? Keep training and try again when your unit's command says you're ready.</p></div>
        </div>
      </section>
      <section>
        <h2>Unit tracks</h2>
        <div class="tracks">
          ${data.units.map((u) => h`
            <div class="track" style="${unitStyle(u)}">
              <h3>${esc(u.display)} <span class="badge ${u.recruiting ? 'open' : 'closed'}">${u.recruiting ? 'Open' : 'Closed'}</span></h3>
              <p style="margin:.3rem 0 0"><b>${esc(u.selection)}</b>${u.selectionShort !== u.selection ? ` (${esc(u.selectionShort)})` : ''}</p>
              <ol>
                <li>Apply with <code>/enlist</code></li>
                ${u.stages.map((s) => `<li>${esc(s.value)}${s.count ? ` <span class="muted">(${s.count})</span>` : ''}</li>`).join('')}
              </ol>
              <p class="muted" style="margin:.6rem 0 0;font-size:.85rem">${esc(UNIT_COPY[u.key]?.course || '')}</p>
            </div>`).join('')}
        </div>
      </section>`;
  }

  function pageSchedule() {
    setTitle('Schedule');
    return h`
      <section>
        <div class="eyebrow">Operations &amp; training</div>
        <h1>Schedule</h1>
        <p class="lead">Upcoming operations, FTXs and training from the Discord. Times are shown in your time zone (${esc(tz)}).</p>
        ${nextEvents(data.upcoming, 30)}
      </section>`;
  }

  function pageJoin() {
    setTitle('Join');
    const open = data.units.filter((u) => u.recruiting);
    return h`
      <section>
        <div class="eyebrow">Recruitment</div>
        <h1>Join USSOCOM</h1>
        <p class="lead">Join the Discord and type <code>/enlist</code>. Pick the unit you want to join; approved, you start that unit's own selection. The short application asks for the name you use in ${esc(data.unit.game)}, your age, time zone and experience.</p>
        <div class="actions">${discordButton('Join the Discord') || '<span class="muted">The Discord invite will appear here.</span>'}</div>
      </section>
      <section class="two">
        <div class="panel">
          <h3>Recruiting now</h3>
          <ul class="checklist">${open.map((u) => `<li><a href="#/units/${esc(u.key)}">${esc(u.display)}</a> <span class="muted">· ${esc(u.parent)} · selection: ${esc(u.selectionShort)}</span></li>`).join('')}</ul>
        </div>
        <div class="panel">
          <h3>What we expect</h3>
          <ul class="checklist">
            <li>Respect: no harassment, slurs or personal attacks.</li>
            <li>Chain of command: team leader first, then your unit's chain.</li>
            <li>Attendance: can't make it? Use <code>/loa</code>.</li>
            <li>Operational security: orders, slotting and briefings stay inside the community.</li>
            <li>No stolen valor. This is a game community, and nobody here claims otherwise.</li>
          </ul>
        </div>
      </section>`;
  }

  function notFound() {
    setTitle('Not found');
    return '<section><h1>Not found</h1><p><a href="#/">Back to the home page</a></p></section>';
  }

  // ---------------------------------------------------------------- members
  const session = {
    get: () => localStorage.getItem(SESSION_KEY),
    set: (t) => localStorage.setItem(SESSION_KEY, t),
    clear: () => localStorage.removeItem(SESSION_KEY),
  };

  function signIn(message = '') {
    setTitle('Members');
    const ready = !!CONFIG.workerUrl;
    return h`
      <div class="signin panel">
        <img src="assets/ussocom.png" alt="" width="96" height="96">
        <h1 style="font-size:1.8rem">Members area</h1>
        <p class="muted">Full roster, ops and attendance, courses, awards and your own service record. Rostered USSOCOM members only.</p>
        ${message ? `<div class="notice bad">${esc(message)}</div>` : ''}
        <button class="btn discord" id="login" ${ready ? '' : 'disabled'}>Sign in with Discord</button>
        ${ready ? '' : '<p class="muted" style="margin-top:1rem">Members sign-in is not switched on yet.</p>'}
      </div>`;
  }

  async function loadMembers() {
    const token = session.get();
    if (!token || !CONFIG.workerUrl) return { error: null, signedOut: true };
    const res = await fetch(`${CONFIG.workerUrl.replace(/\/+$/, '')}/api/members`, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
    if (!res) return { error: 'The members server could not be reached. Try again in a minute.' };
    if (res.status === 401) { session.clear(); return { signedOut: true, error: 'Your session expired. Sign in again.' }; }
    if (res.status === 403) { session.clear(); return { signedOut: true, error: 'That Discord account is not on the USSOCOM roster. Enlist in the Discord first.' }; }
    if (!res.ok) return { error: `The members server answered ${res.status}.` };
    return { body: await res.json() };
  }

  const memberTabs = [['me', 'My record'], ['roster', 'Roster'], ['orbat', 'ORBAT'], ['ops', 'Ops'], ['courses', 'Courses'], ['awards', 'Awards']];

  function membersShell(tab, inner) {
    const v = members.viewer;
    return h`
      <section>
        <div class="section-head">
          <div><div class="eyebrow">Members area</div><h1 style="font-size:2rem">Welcome, ${esc(v.name)}</h1></div>
          <button class="btn small" id="logout">Sign out</button>
        </div>
        <div class="tabs" role="tablist">${memberTabs.map(([k, label]) => `<button role="tab" data-tab="${k}" class="${k === tab ? 'active' : ''}">${label}</button>`).join('')}</div>
        <div id="member-body">${inner}</div>
        <p class="muted" style="margin-top:1.5rem;font-size:.8rem">Data from the roster sheet, updated ${esc(when(members.data.generated))}. Wrong? Tell your leadership: the roster is the source of truth.</p>
      </section>`;
  }

  const person = (id) => members.data.roster.find((p) => p.id === id);
  const rankText = (p) => (p.rank ? p.rank.abbr : '');

  function recordView(p, own) {
    if (!p) return '<div class="empty">Not found on the roster.</div>';
    const ops = members.data.ops;
    return h`
      <div class="panel" style="margin-top:1rem">
        <div class="profile">
          <div class="rank">${esc(rankText(p))}</div>
          <div>
            <h2 style="margin:0">${esc(p.name)}</h2>
            <div class="muted">${esc(p.rank?.name || '')}${p.rank?.grade ? ` · ${esc(p.rank.grade)}` : ''} · ${esc(p.service || '')}</div>
          </div>
        </div>
        <dl class="kv">
          <dt>Unit</dt><dd>${esc(p.unitName || 'Unassigned')}</dd>
          <dt>Seat</dt><dd>${p.seat ? `<span class="mono">${esc(p.seat)}</span> ${p.callsign ? `· ${esc(p.callsign)}` : ''} ${p.billet ? `· ${esc(p.billet)}` : ''}${p.seated ? '' : ' <span class="badge warn">not seated</span>'}` : '<span class="muted">None</span>'}</dd>
          ${p.seat2 ? `<dt>Second seat</dt><dd><span class="mono">${esc(p.seat2.id)}</span> · ${esc(p.seat2.callsign)} · ${esc(p.seat2.billet)}</dd>` : ''}
          <dt>Pipeline</dt><dd>${esc(p.pipeline || '')}</dd>
          <dt>Status</dt><dd>${statusBadge(p.status)}</dd>
          <dt>Joined</dt><dd>${esc(p.joined || '—')}</dd>
          <dt>Last promotion</dt><dd>${esc(p.promoted || '—')}</dd>
          <dt>Ops attended</dt><dd>${p.opsAttended}${ops.length ? ` <span class="muted">of the last ${ops.filter((o) => o.status === 'Complete').length} completed</span>` : ''}</dd>
        </dl>
      </div>
      <div class="two" style="margin-top:1rem">
        <div class="panel"><h3>Qualifications</h3>${p.quals.length ? `<div class="chips">${p.quals.map((q) => `<span class="chip">${esc(q)}</span>`).join('')}</div>` : '<p class="muted">None yet.</p>'}</div>
        <div class="panel"><h3>Awards</h3>${p.awards.length ? `<ul class="checklist">${p.awards.map((a) => `<li>${esc(a.award)} <span class="muted">· ${esc(a.date)}${a.op ? ` · ${esc(a.op)}` : ''}</span></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}</div>
      </div>
      ${own ? '' : '<p><a href="#/members/roster">← Back to the roster</a></p>'}`;
  }

  const statusBadge = (s) => `<span class="badge ${s === 'Active' ? 'open' : s === 'LOA' ? 'warn' : 'closed'}">${esc(s)}</span>`;

  function rosterView() {
    const units = [['', 'All units'], ['hq', 'USSOCOM HQ'], ...data.units.map((u) => [u.key, u.short])];
    return h`
      <div class="toolbar">
        <input id="q" type="search" placeholder="Search name, seat, callsign, qualification…" aria-label="Search the roster">
        <select id="unit" aria-label="Unit">${units.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <select id="status" aria-label="Status"><option value="">Any status</option><option>Active</option><option>LOA</option><option>Reserve</option></select>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th data-sort="name">Name</th><th data-sort="rank">Rank</th><th data-sort="unit">Unit</th><th data-sort="seat">Seat</th><th>Billet</th><th data-sort="pipeline">Pipeline</th><th data-sort="status">Status</th><th data-sort="ops">Ops</th><th>Quals</th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div>`;
  }

  function rosterRows(filter) {
    const q = filter.q.toLowerCase();
    const rows = members.data.roster.filter((p) => (!filter.unit || p.unit === filter.unit) && (!filter.status || p.status === filter.status)
      && (!q || [p.name, p.seat, p.callsign, p.billet, p.pipeline, rankText(p), ...p.quals].join(' ').toLowerCase().includes(q)));
    const key = filter.sort;
    const order = ['hq', ...data.units.map((u) => u.key)];
    const unitIdx = (p) => (p.unit ? order.indexOf(p.unit) : order.length);
    const bySeat = (a, b) => unitIdx(a) - unitIdx(b) || (a.seat ? 0 : 1) - (b.seat ? 0 : 1)
      || String(a.seat || '').localeCompare(String(b.seat || ''), undefined, { numeric: true }) || a.name.localeCompare(b.name);
    const val = (p) => ({ name: p.name.toLowerCase(), pipeline: p.pipeline || '~', status: p.status, ops: -p.opsAttended }[key]);
    rows.sort((a, b) => {
      if (key === 'unit' || key === 'seat') return bySeat(a, b);
      if (key === 'rank') return gradeRank(b.rank?.grade) - gradeRank(a.rank?.grade) || bySeat(a, b);
      const x = val(a); const y = val(b);
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) || bySeat(a, b);
    });
    return rows.map((p) => h`
      <tr>
        <td><a href="#/members/person/${esc(p.id)}">${esc(p.name)}</a></td>
        <td class="mono">${esc(rankText(p))}</td>
        <td>${esc(p.unitName || '—')}</td>
        <td class="mono">${esc(p.seat || '—')}</td>
        <td>${esc(p.billet || '')}</td>
        <td>${esc(p.pipeline || '')}</td>
        <td>${statusBadge(p.status)}</td>
        <td>${p.opsAttended}</td>
        <td><div class="chips">${p.quals.map((q2) => `<span class="chip">${esc(q2)}</span>`).join('')}</div></td>
      </tr>`).join('') || '<tr><td colspan="9" class="muted">Nobody matches.</td></tr>';
  }

  const gradeRank = (g) => {
    const [k, n] = String(g || 'E-0').split('-');
    return (k === 'O' ? 20 : k === 'W' ? 10 : 0) + Number(n || 0);
  };

  function membersOrbatView() {
    const o = members.data.orbat;
    return [['hq', 'USSOCOM HQ', null], ...data.units.map((u) => [u.key, u.display, u])].map(([k, label, u]) => h`
      <section class="orbat-unit" style="${unitStyle(u)}">
        <header><h2>${esc(label)}</h2><span class="muted">${o[k].filled}/${o[k].seats}</span></header>
        ${orbatElements(o[k], { named: true })}
      </section>`).join('');
  }

  function opsView() {
    const ops = members.data.ops;
    if (!ops.length) return '<div class="empty" style="margin-top:1rem">No operations on record yet.</div>';
    return h`
      <div class="table-wrap" style="margin-top:1rem"><table>
        <thead><tr><th>Op</th><th>Name</th><th>Type</th><th>Start</th><th>Status</th><th>Attending</th><th>Tentative</th><th>Absent</th><th>Attended</th><th>Lead</th></tr></thead>
        <tbody>${ops.map((op) => h`
          <tr><td class="mono">${esc(op.id)}</td><td>${esc(op.name)}</td><td>${esc(op.type)}</td><td>${esc(when(op.start))}</td>
          <td><span class="badge ${op.status === 'Complete' ? 'open' : op.status === 'Cancelled' ? 'closed' : 'gold'}">${esc(op.status)}</span></td>
          <td>${op.Attending}</td><td>${op.Tentative}</td><td>${op.Absent}</td><td>${op.status === 'Complete' ? op.attended : '—'}</td><td>${esc(op.lead || '')}</td></tr>`).join('')}</tbody>
      </table></div>`;
  }

  function coursesView() {
    const list = members.data.courses;
    if (!list.length) return '<div class="empty" style="margin-top:1rem">No courses on record yet.</div>';
    return h`
      <div class="table-wrap" style="margin-top:1rem"><table>
        <thead><tr><th>Course</th><th>Qualification</th><th>Start</th><th>Status</th><th>Instructor</th><th>Enrolled</th><th>Passed</th></tr></thead>
        <tbody>${list.map((c) => h`
          <tr><td class="mono">${esc(c.id)}</td><td>${esc(c.qual)}</td><td>${esc(when(c.start))}</td>
          <td><span class="badge ${c.status === 'Complete' ? 'open' : c.status === 'Cancelled' ? 'closed' : 'gold'}">${esc(c.status)}</span></td>
          <td>${esc(c.instructor || '')}</td><td>${c.enrolled}${c.seats ? `/${c.seats}` : ''}</td><td>${c.passed}</td></tr>`).join('')}</tbody>
      </table></div>`;
  }

  function awardsView() {
    const list = members.data.awards;
    if (!list.length) return '<div class="empty" style="margin-top:1rem">No awards yet.</div>';
    return `<div class="events" style="margin-top:1rem">${list.map((a) => h`
      <article class="panel">
        <h3>${esc(a.award)} <span class="muted" style="font-weight:400">· ${a.id ? `<a href="#/members/person/${esc(a.id)}">${esc(a.name)}</a>` : esc(a.name)}</span></h3>
        <div class="muted">${esc(a.date)}${a.op ? ` · ${esc(a.op)}` : ''}${a.by ? ` · awarded by ${esc(a.by)}` : ''}</div>
        ${a.citation ? `<p>${esc(a.citation)}</p>` : ''}
      </article>`).join('')}</div>`;
  }

  async function pageMembers(rest) {
    const [tab = 'me', arg] = rest;
    if (!members) {
      const got = await loadMembers();
      if (!got.body) return signIn(got.error || '');
      members = got.body;
    }
    setTitle('Members');
    let inner;
    if (tab === 'person') inner = recordView(person(arg), false);
    else if (tab === 'roster') inner = rosterView();
    else if (tab === 'orbat') inner = membersOrbatView();
    else if (tab === 'ops') inner = opsView();
    else if (tab === 'courses') inner = coursesView();
    else if (tab === 'awards') inner = awardsView();
    else inner = recordView(person(members.viewer.id), true);
    return membersShell(tab === 'person' ? 'roster' : tab, inner);
  }

  function wireMembers() {
    document.getElementById('login')?.addEventListener('click', () => {
      const back = `${location.origin}${location.pathname}`;
      location.href = `${CONFIG.workerUrl.replace(/\/+$/, '')}/login?return=${encodeURIComponent(back)}`;
    });
    document.getElementById('logout')?.addEventListener('click', () => {
      session.clear(); members = null; location.hash = '#/';
    });
    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/members/${b.dataset.tab}`; }));
    const rows = document.getElementById('rows');
    if (rows) {
      const filter = { q: '', unit: '', status: '', sort: 'unit' };
      const draw = () => { rows.innerHTML = rosterRows(filter); };
      document.getElementById('q').addEventListener('input', (e) => { filter.q = e.target.value; draw(); });
      document.getElementById('unit').addEventListener('change', (e) => { filter.unit = e.target.value; draw(); });
      document.getElementById('status').addEventListener('change', (e) => { filter.status = e.target.value; draw(); });
      document.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => { filter.sort = th.dataset.sort; draw(); }));
      draw();
    }
  }

  // ---------------------------------------------------------------- router
  function takeSession() {
    // The Worker returns here as #/members?session=<token>
    const m = location.hash.match(/[?&]session=([^&]+)/);
    if (!m) return;
    session.set(decodeURIComponent(m[1]));
    members = null;
    history.replaceState(null, '', `${location.pathname}#/members`);
  }

  async function route() {
    takeSession();
    const path = (location.hash.replace(/^#\/?/, '').split('?')[0] || '').split('/').filter(Boolean);
    const [page, ...rest] = path;
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${page || ''}`));
    document.getElementById('nav').classList.remove('open');
    let html;
    try {
      if (!page) html = pageHome();
      else if (page === 'units' && rest[0]) html = pageUnit(rest[0]);
      else if (page === 'units') html = pageUnits();
      else if (page === 'orbat') html = pageOrbat();
      else if (page === 'pipeline') html = pagePipeline();
      else if (page === 'schedule') html = pageSchedule();
      else if (page === 'join') html = pageJoin();
      else if (page === 'media') html = pageMedia();
      else if (page === 'members') html = await pageMembers(rest);
      else html = notFound();
    } catch (err) {
      html = `<div class="notice bad">Something went wrong: ${esc(err.message)}</div>`;
    }
    closeViewer();
    main.innerHTML = html;
    wireMembers();
    wireMedia();
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  async function start() {
    document.querySelector('.menu-toggle').addEventListener('click', (e) => {
      const nav = document.getElementById('nav');
      const open = nav.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', String(open));
    });
    try {
      const res = await fetch(`${CONFIG.dataUrl}?t=${Math.floor(Date.now() / 60000)}`);
      data = await res.json();
    } catch {
      main.innerHTML = '<div class="notice bad">The roster data could not be loaded. Try again shortly.</div>';
      return;
    }
    media = await fetch(`data/media.json?t=${Math.floor(Date.now() / 60000)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (data.discordInvite) {
      const link = document.getElementById('discord-link');
      link.href = data.discordInvite;
      link.hidden = false;
    }
    document.getElementById('motto').textContent = data.unit.motto;
    document.getElementById('updated').textContent = `Roster updated ${when(data.generated)}`;
    window.addEventListener('hashchange', route);
    route();
  }

  start();
})();
