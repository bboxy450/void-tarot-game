// Rule machines: small state machines, one per rule of the design.
// A handler returns  ok(patch, ...effects) | no(reason) | skip(reason).

function ok(patch) { return { o: 'accepted', patch: patch, fx: [].slice.call(arguments, 1) }; }
function no(reason) { return { o: 'rejected', reason: reason }; }
function skip(reason) { return { o: 'ignored', reason: reason }; }

function machine(name, initial, handlers) {
  var m = { name: name, s: initial() };
  m.reset = function () { m.s = initial(); };
  m.send = function (event) {
    var r = handlers[event].apply(null, [m.s].concat([].slice.call(arguments, 1)));
    if (r.o === 'accepted') Object.assign(m.s, r.patch);
    return r;
  };
  return m;
}
function has(set, x) { return set.indexOf(x) >= 0; }
function add(set, x) { return has(set, x) ? set : set.concat([x]); }

// What a cast does to the ground. Also used to look ahead.
function surfaceCast(s, e) {
  if (s.ground === 'Ground.Bare' && e === 'Element.Earth') return ok({ ground: 'Ground.Oil', left: e });
  if (s.ground === 'Ground.Bare' && e === 'Element.Water') return ok({ ground: 'Ground.Wet', left: e });
  if (s.ground === 'Ground.Oil' && e === 'Element.Fire') return ok({ ground: 'Ground.Bare' }, 'Explode');
  if (s.ground === 'Ground.Wet' && e === 'Element.Air') return ok({ ground: 'Ground.Charged', left: e });
  if (s.ground === 'Ground.Charged' && e === 'Element.Air') return ok({}, 'Zap');
  return skip('NoReaction');
}

function makeMachines() {
  var M = {};

  M.journey = machine('journey', function () { return { chapter: 0, beat: 0, age: 10, gameSeen: false }; }, {
    WatchNobles: function (s) {
      return s.chapter === 0 && !s.gameSeen ? ok({ gameSeen: true }) : skip('AlreadySeen');
    },
    CompleteChapter: function (s) {
      if (s.gameSeen && s.chapter < 78 && s.beat < 2) return ok({ chapter: s.chapter + 1, beat: s.beat + 1 });
      if (s.gameSeen && s.chapter < 78 && s.beat === 2) return ok({ chapter: s.chapter + 1, beat: 0, age: s.age + 1 });
      if (!s.gameSeen && s.chapter < 78) return no('GameNotDiscovered');
      return no('JourneyOver');
    }
  });

  M.chapter = machine('chapter', function () {
    return { read: false, lived: false, secret: 'Secret.Hidden', cast: false, found: false };
  }, {
    VisitPsychic: function (s) { return !s.read ? ok({ read: true }, 'Reading') : skip('AlreadyRead'); },
    ResolveEncounter: function (s) { return !s.lived ? ok({ lived: true }) : skip('AlreadyLived'); },
    UncoverPhrase: function (s) {
      return s.secret === 'Secret.Hidden' ? ok({ secret: 'Secret.Phrase' }, 'RevealSpell') : skip('AlreadyUncovered');
    },
    UncoverSymbol: function (s) {
      return s.secret === 'Secret.Hidden' ? ok({ secret: 'Secret.Symbol' }, 'RevealSpell') : skip('AlreadyUncovered');
    },
    CastSpell: function (s) {
      if (s.secret !== 'Secret.Hidden' && !s.cast) return ok({ cast: true });
      if (s.secret === 'Secret.Hidden') return no('SpellUnknown');
      return skip('AlreadyCast');
    },
    FindHiddenCard: function (s) { return !s.found ? ok({ found: true }) : skip('AlreadyFound'); },
    Advance: function (s) {
      return s.read && s.lived && s.cast && s.found
        ? ok({ read: false, lived: false, secret: 'Secret.Hidden', cast: false, found: false }, 'NextChapter')
        : no('ChapterUnfinished');
    }
  });

  M.encounter = machine('encounter', function () {
    return { open: false, mode: 'Mode.Trick', opposed: false, obstacle: 'Obstacle.None', shaped: false };
  }, {
    Open: function (s, m, foe) {
      if (!s.open && (foe || m !== 'Mode.Trick')) return ok({ open: true, mode: m, opposed: foe });
      if (!s.open && !foe && m === 'Mode.Trick') return no('NeedsOpponents');
      return no('AlreadyOpen');
    },
    HoldBack: function (s) {
      return s.open && s.obstacle === 'Obstacle.None' ? ok({ obstacle: 'Obstacle.Standing' }) : no('CannotStand');
    },
    Beat: function (s) {
      return s.obstacle === 'Obstacle.Standing' ? ok({ obstacle: 'Obstacle.Beaten' }) : no('NothingStanding');
    },
    Decide: function (s) {
      return s.obstacle === 'Obstacle.Standing' ? ok({ obstacle: 'Obstacle.Decided', shaped: true }) : no('NothingStanding');
    },
    Resolve: function (s) {
      if (s.open && s.obstacle !== 'Obstacle.Standing') return ok({ open: false, opposed: false, obstacle: 'Obstacle.None' }, 'Resolved');
      if (s.open && s.obstacle === 'Obstacle.Standing') return no('HeldBack');
      return no('NotOpen');
    }
  });

  M.trick = machine('trick', function () { return { played: 'Nothing', top: 0, contends: false }; }, {
    RivalTrumps: function (s, r) { return r > s.top ? ok({ top: r, contends: false }) : skip('LowerTrump'); },
    Follow: function (s, canFollow) {
      if (s.played === 'Nothing' && canFollow) return ok({ played: 'Followed', contends: s.top === 0 });
      if (s.played === 'Nothing' && !canFollow) return no('CannotFollow');
      return no('AlreadyPlayed');
    },
    Trump: function (s, r, canFollow) {
      if (s.played === 'Nothing' && !canFollow) return ok({ played: 'Trumped', contends: r > s.top, top: r > s.top ? r : s.top });
      if (s.played === 'Nothing' && canFollow) return no('MustFollowSuit');
      return no('AlreadyPlayed');
    },
    Discard: function (s, canFollow, hasTrump) {
      if (s.played === 'Nothing' && !canFollow && !hasTrump) return ok({ played: 'Discarded' });
      if (s.played === 'Nothing' && canFollow) return no('MustFollowSuit');
      if (s.played === 'Nothing' && !canFollow && hasTrump) return no('MustTrump');
      return no('AlreadyPlayed');
    },
    PlayFool: function (s) { return s.played === 'Nothing' ? ok({ played: 'Excused' }, 'FoolReturns') : no('AlreadyPlayed'); },
    Gather: function (s) { return s.played !== 'Nothing' ? ok({ played: 'Nothing', top: 0, contends: false }) : no('TrickOpen'); }
  });

  M.numeric = machine('numeric', function () { return { target: 0, total: 0 }; }, {
    Pose: function (s, t) { return s.target === 0 ? ok({ target: t }) : no('AlreadyPosed'); },
    Play: function (s, v) {
      if (s.target > 0 && s.total + v <= s.target) return ok({ total: s.total + v });
      if (s.target > 0 && s.total < s.target && s.total + v > s.target) return no('Overshoot');
      if (s.target > 0 && s.total === s.target) return no('AlreadySolved');
      return no('NothingPosed');
    },
    Withdraw: function (s) { return s.target > 0 && s.total < s.target ? ok({ target: 0, total: 0 }) : no('NothingToWithdraw'); },
    Leave: function (s) { return s.target > 0 && s.total === s.target ? ok({ target: 0, total: 0 }, 'Solved') : no('Unsolved'); }
  });

  M.surface = machine('surface', function () { return { ground: 'Ground.Bare', left: 'Element.Earth' }; }, {
    Cast: surfaceCast
  });

  M.character = machine('character', function () {
    return { standing: false, held: [], won: false, way: 'Victory.Affection' };
  }, {
    Stand: function (s, c) {
      if (!s.standing && c !== 'Class.Pip') return ok({ standing: true });
      if (!s.standing && c === 'Class.Pip') return no('NotACharacter');
      return no('AlreadyStanding');
    },
    Attach: function (s, a) {
      if (s.standing && !s.won && !has(s.held, a)) return ok({ held: add(s.held, a) });
      if (!s.standing) return no('NoCharacter');
      return skip('NothingToAdd');
    },
    Win: function (s, p) {
      var h = function (a) { return has(s.held, 'Attribute.' + a); };
      var live = s.standing && !s.won;
      if (live && p === 'Victory.Affection' && h('Affection') && h('Population')) return ok({ won: true, way: p });
      if (live && p === 'Victory.Resources' && h('Resources')) return ok({ won: true, way: p });
      if (live && p === 'Victory.Attack' && h('Population') && h('Resources')) return ok({ won: true, way: p });
      if (live && p === 'Victory.Impenetrable' && h('Defence')) return ok({ won: true, way: p });
      return no('NotYet');
    },
    Leave: function (s) { return s.won ? ok({ standing: false, held: [], won: false }) : no('NotWon'); }
  });

  function complete(s) {
    var f = function (p) { return has(s.filled, 'Slot.' + p); };
    return f('Left') && f('Centre') && f('Right') && (s.shape === 'Shape.Row' || (f('Above') && f('Below')));
  }
  M.spread = machine('spread', function () {
    return { open: false, shape: 'Shape.Row', filled: [], changed: [], pending: false };
  }, {
    Choose: function (s, sh) { return !s.open ? ok({ open: true, shape: sh }) : no('SpreadOpen'); },
    Lay: function (s, p) {
      var out = s.shape === 'Shape.Row' && (p === 'Slot.Above' || p === 'Slot.Below');
      if (s.open && out) return no('NotInShape');
      if (s.open && !out && !has(s.filled, p) && !s.pending) return ok({ filled: add(s.filled, p) });
      if (s.open && !out && !has(s.filled, p) && s.pending) return ok({ filled: add(s.filled, p), changed: add(s.changed, p), pending: false });
      if (!s.open) return no('NoSpread');
      return no('PositionFilled');
    },
    LayModifier: function (s) { return s.open && !s.pending && !complete(s) ? ok({ pending: true }) : no('NothingToModify'); },
    Cast: function (s) {
      return s.open && !s.pending && complete(s) ? ok({ open: false, filled: [], changed: [] }, 'Resolve') : no('Incomplete');
    }
  });

  var SUIT_EL = { 'Suit.Wands': 'Fire', 'Suit.Cups': 'Water', 'Suit.Swords': 'Air', 'Suit.Pentacles': 'Earth' };
  var RANK_EL = { 'Rank.Page': 'Earth', 'Rank.Knight': 'Air', 'Rank.Queen': 'Water', 'Rank.King': 'Fire' };
  var PATTERN = [null, 'Beginning', 'Duality', 'Growth', 'Structure', 'Conflict', 'Harmony', 'Challenge', 'Movement', 'Fruition', 'Completion'];
  var TRUMP = {
    Fool: 'TeachElement(Element.Air)', HangedMan: 'TeachElement(Element.Water)', Judgement: 'TeachElement(Element.Fire)',
    Magician: 'TeachPlanet(Planet.Mercury)', HighPriestess: 'TeachPlanet(Planet.Moon)', Empress: 'TeachPlanet(Planet.Venus)',
    Wheel: 'TeachPlanet(Planet.Jupiter)', Tower: 'TeachPlanet(Planet.Mars)', Sun: 'TeachPlanet(Planet.Sun)', World: 'TeachPlanet(Planet.Saturn)',
    Emperor: 'TeachSign(Sign.Aries)', Hierophant: 'TeachSign(Sign.Taurus)', Lovers: 'TeachSign(Sign.Gemini)', Chariot: 'TeachSign(Sign.Cancer)',
    Strength: 'TeachSign(Sign.Leo)', Hermit: 'TeachSign(Sign.Virgo)', Justice: 'TeachSign(Sign.Libra)', Death: 'TeachSign(Sign.Scorpio)',
    Temperance: 'TeachSign(Sign.Sagittarius)', Devil: 'TeachSign(Sign.Capricorn)', Star: 'TeachSign(Sign.Aquarius)', Moon: 'TeachSign(Sign.Pisces)'
  };
  M.correspondences = machine('correspondences', function () { return { suits: [], ranks: [], courtRead: false }; }, {
    PlaySuit: function (s, x) {
      return !has(s.suits, x) ? ok({ suits: add(s.suits, x) }, 'TeachElement(Element.' + SUIT_EL[x] + ')') : skip('AlreadyLearned');
    },
    PlayRank: function (s, x) {
      return !has(s.ranks, x) ? ok({ ranks: add(s.ranks, x) }, 'TeachElement(Element.' + RANK_EL[x] + ')') : skip('AlreadyLearned');
    },
    PlayNumber: function (s, n) { return ok({}, 'TeachPattern(Pattern.' + PATTERN[n] + ')'); },
    PlayTrump: function (s, t) { return ok({}, TRUMP[t.replace('Trump.', '')]); },
    ReadCourt: function (s, r, su) {
      return has(s.ranks, r) && has(s.suits, su)
        ? ok({ courtRead: true }, 'Court(Element.' + RANK_EL[r] + ', Element.' + SUIT_EL[su] + ')')
        : no('NotYetLearned');
    }
  });

  return M;
}
if (typeof module !== 'undefined') { module.exports = makeMachines; makeMachines.surfaceCast = surfaceCast; }
