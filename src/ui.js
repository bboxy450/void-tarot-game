// The screen. Reads the game, draws it, sends clicks back.
(function () {
  var KEY = 'void-tarot-game-1', G, modifierNext = false;
  var q = new URLSearchParams(location.search);

  function boot(n, seed) {
    G = makeGame(seed);
    G.resume(n);
    window.G = G;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ n: G.M.journey.s.chapter, seed: G.seed })); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }

  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function card(c, act, note, cls) {
    return '<div class="card ' + (act ? 'play ' : '') + (cls || '') + '"' + (act ? ' data-a="' + act + '"' : '') + '>' +
      '<img src="' + c.img + '" alt="' + esc(c.title) + '"><small>' + esc(c.title) + '</small>' + (note ? esc(note) : '') + '</div>';
  }
  function back(act) { return '<div class="card play" data-a="' + act + '"><img src="assets/cards/back.jpg" alt="face-down card"></div>'; }
  function hand(cards, act, note) { return '<div class="row">' + cards.map(function (c, i) { return card(c, act + ':' + i, note ? note(c) : ''); }).join('') + '</div>'; }
  function step(n, title, done, body) {
    return '<section class="step' + (done ? ' done' : '') + '"><h3><b>' + n + '</b> ' + title + (done ? '<i>done</i>' : '') + '</h3>' + body + '</section>';
  }

  function encounter(ch) {
    var M = G.M, e = ch.enc;
    if (ch.encDone) return '<p class="fact">Lived.</p>';
    if (!e) return '<button data-a="openEncounter">' + (G.M.journey.s.chapter === 0 ? 'Watch the nobles play' : 'Enter the encounter') + '</button>';
    var out = '<p class="fact">' + esc(e.goal) + '</p>';
    if (ch.mode === 'Trick') {
      var t = e.tricks[e.k];
      out += '<p class="fact">Trick <b>' + (e.k + 1) + ' of 3</b>, taken <b>' + e.taken + '</b>. ' +
        (t.rival ? 'A noble has already trumped with <b>trump ' + t.rival + '</b>.' : 'Nobody has trumped.') + '</p>' +
        '<div class="row">' + card(t.lead, '', 'led') + '</div><p class="fact">Your hand:</p>' + hand(e.hand, 'playTrick');
    } else if (ch.mode === 'Numeric') {
      out += '<p class="fact">Total <b>' + M.numeric.s.total + '</b> of <b>' + M.numeric.s.target + '</b>.</p>' +
        hand(e.hand, 'playNumber', function (c) { return 'worth ' + c.n; }) + '<p><button data-a="withdraw">Take the cards back</button></p>';
    } else if (ch.mode === 'Elemental') {
      out += '<p class="fact">On the ground: <b>' + M.surface.s.ground.replace('Ground.', '').toLowerCase() + '</b>.</p>' +
        hand(e.hand, 'castElement', function (c) { return ELEMENT[c.suit]; });
    } else {
      var s = M.character.s;
      out += '<p class="fact">Character: <b>' + (e.who ? esc(e.who.title) : 'nobody yet') + '</b>. Holds: <b>' +
        (s.held.map(function (a) { return a.replace('Attribute.', '').toLowerCase(); }).join(', ') || 'nothing') + '</b>.</p>' +
        hand(e.hand, 'playCharacter', function (c) { return isPip(c) ? ATTRIBUTE[c.suit].toLowerCase() : 'character'; }) +
        '<p class="row">' + ['Affection', 'Resources', 'Attack', 'Impenetrable'].map(function (w) { return '<button data-a="claim:' + w + '">Win by ' + (w === 'Impenetrable' ? 'being impenetrable' : w.toLowerCase()) + '</button>'; }).join('') + '</p>';
    }
    return out;
  }

  function draw() {
    var j = G.M.journey.s, c = G.M.chapter.s, ch = G.ch;
    document.getElementById('head').innerHTML = '<h1>VOID TAROT</h1>' +
      '<span>' + (G.over ? 'The journey is complete' : 'Chapter ' + j.chapter + ' of 78') + '</span><span>The Fool is ' + j.age + '</span><span>Deck: ' + G.deck.length + ' cards</span>' +
      '<span class="grow"></span><button data-a="reset">Start over</button>';
    var side = '<aside><h3>What the cards have taught you</h3><ul>' +
      (G.lessons.slice(-12).reverse().map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') || '<li>Nothing yet. Play a card.</li>') + '</ul></aside>';
    if (G.over) {
      document.getElementById('main').innerHTML = '<div class="end"><h2>The Fool is ' + j.age + '.</h2><p>Seventy-eight chapters, seventy-eight cards.</p></div>';
      return;
    }
    var slots = ['Left', 'Centre', 'Right'].map(function (p) {
      var l = ch.laid[p]; return l && !ch.spellCast ? card(l.card, '', l.changed ? 'changed' : p.toLowerCase(), l.changed ? 'changed' : '') : '<div class="slot">' + p.toLowerCase() + '</div>';
    }).join('');
    document.getElementById('main').innerHTML =
      '<div class="hero"><img src="' + ch.card.img + '" alt=""><h2>' + esc(ch.card.title) + '</h2><p>' + esc(ch.card.meaning) + '</p>' +
      '<p>This chapter uses the cards as: <b>' + { Trick: 'the nobles\' game', Numeric: 'numbers', Elemental: 'elements', Character: 'characters' }[ch.mode] + '</b>.</p></div>' +
      '<div><div id="msg">' + esc(G.msg || 'Five things must be done before the chapter lets you go.') + '</div>' +
      step(1, 'The psychic reads for you', c.read, ch.reading
        ? '<div class="row">' + ch.reading.map(function (x) { return card(x, '', x.up.join(', ')); }).join('') + '</div>'
        : '<button data-a="visitPsychic">Visit the psychic</button>') +
      step(2, 'Live the chapter', c.lived, encounter(ch)) +
      step(3, 'Uncover the phrase or the symbol', ch.secret.found, ch.secret.found
        ? '<p class="fact"><b>' + esc(ch.secret.text) + '</b>: ' + esc(ch.secret.gloss) + '. It reveals a spell.</p>'
        : '<button data-a="search">Search the chapter</button>') +
      step(4, 'Cast the spell as a three-card row', c.cast, ch.spellCast ? '<p class="fact">Cast. The table is clear and no card was altered.</p>'
        : '<div class="row">' + slots + '</div><p class="fact">' + (ch.modifier && G.M.spread.s.pending ? '<b>' + esc(ch.modifier.title) + '</b> will change the next card laid. ' : '') + 'Lay cards from left to right:</p>' +
          hand(ch.spellHand, 'spell') + '<p class="row"><button data-a="modifier" class="' + (modifierNext ? 'on' : '') + '">Lay the next card as a modifier</button><button data-a="cast">Cast</button></p>') +
      step(5, 'Find the hidden card', c.found, '<div class="row">' + ch.hidden.map(function (h, i) { return h.up ? card(h.card, '') : back('flip:' + i); }).join('') + '</div>') +
      '<p><button class="big" data-a="advance">Leave the chapter</button></p></div>' + side;
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-a]'); if (!el) return;
    var a = el.getAttribute('data-a').split(':'), act = a[0], arg = a[1];
    if (act === 'reset') { if (confirm('Start the journey over?')) { localStorage.removeItem(KEY); boot(0, Date.now() % 1e9); } }
    else if (act === 'modifier') modifierNext = !modifierNext;
    else if (act === 'spell') { if (modifierNext) G.layModifier(+arg); else G.lay(+arg); modifierNext = false; }
    else if (act === 'claim') G.claim(arg);
    else G[act](arg === undefined ? undefined : +arg);
    save(); draw();
  });

  // ?auto=N plays N chapters with the scripted player; ?enter=1 opens the encounter. For looking at later chapters quickly.
  var saved = q.has('auto') || q.has('fresh') ? null : load();
  boot(saved ? saved.n : 0, saved ? saved.seed : Number(q.get('seed')) || Date.now() % 1e9);
  for (var i = 0; i < Number(q.get('auto') || 0) && !G.over; i++) G.botChapter();
  if (q.has('enter') && !G.over) { G.visitPsychic(); G.openEncounter(); }
  draw();
})();
