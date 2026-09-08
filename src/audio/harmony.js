/**
 * harmony.js — the harmonic field. Pure state, zero Web Audio: this file
 * decides WHAT notes exist right now, never how they sound.
 *
 * ── The field ───────────────────────────────────────────────────────────────
 * Everything pitched — slice notes, combo chords, the pad, the bass pulse,
 * the arp sparkle — asks this file for notes, so one chord change re-colors
 * the whole mix at once. The player can never play a wrong note: species map
 * to chord-tone ROLES (big fruit = low chord tones, small fruit = high color
 * tones), not to fixed pitches. The old fixed `species.pitch` survives only
 * as the fallback if this file ever throws.
 *
 * ── The progressions ────────────────────────────────────────────────────────
 * Tonal center stays A: the ambient drone (A1/E2/A2/E3) is the pedal point,
 * and every chord below is chosen to sit consonantly over an A–E pedal. One
 * palette per level, looping; all diatonic to A major except Golden Hour's
 * borrowed G-natural (the mixolydian "sunset" chord). The chord clock lives
 * in the conductor — this file just advances when told to.
 *
 * Pitch convention: semitones from A3 = 220 Hz (same as species.pitch), so
 * A1 = -24, E2 = -17, A5 = +24. Pitch classes are semitones from A (A=0,
 * B=2, C#=4, D=5, E=7, F#=9, G=10, G#=11).
 */

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const E2 = -17;   // below this, only wide intervals (the anti-mud line)

// Chords: `bass` pitch class, `tones` ordered low-role → high-role,
// `color` the top extension a strawberry rings.
const PALETTES = [
  // 0 Still Water — near-static sus breathing, barely a progression
  [
    { name: 'Aadd9', bass: 0, tones: [0, 7, 2], color: 2 },
    { name: 'Dmaj9/A', bass: 0, tones: [5, 9, 0, 4], color: 7 },
  ],
  // 1 First Light — the first real I–IV–vi–V motion, all soft extensions
  [
    { name: 'Aadd9', bass: 0, tones: [0, 4, 7], color: 2 },
    { name: 'Dmaj9', bass: 5, tones: [5, 9, 0, 4], color: 7 },
    { name: 'F#m11', bass: 9, tones: [9, 0, 4, 7], color: 2 },
    { name: 'Esus4(9)', bass: 7, tones: [7, 0, 2], color: 9 },
  ],
  // 2 Morning Dew — sus2 glisten, everything slightly open
  [
    { name: 'Asus2', bass: 0, tones: [0, 7, 2], color: 9 },
    { name: 'E/G#', bass: 11, tones: [7, 11, 2], color: 9 },
    { name: 'F#m9', bass: 9, tones: [9, 0, 4, 7], color: 11 },
    { name: 'Dadd9', bass: 5, tones: [5, 9, 0], color: 7 },
  ],
  // 3 Orchard Rain — descending bass A→G#→F#→D, the ballad turnaround
  [
    { name: 'A', bass: 0, tones: [0, 4, 7], color: 2 },
    { name: 'E/G#', bass: 11, tones: [7, 11, 2], color: 9 },
    { name: 'F#m7', bass: 9, tones: [9, 0, 4, 7], color: 7 },
    { name: 'Dmaj9', bass: 5, tones: [5, 9, 0, 4], color: 7 },
  ],
  // 4 Noon Bloom — the brightest, most diatonic motion of the day
  [
    { name: 'Dmaj7', bass: 5, tones: [5, 9, 0, 4], color: 7 },
    { name: 'A/C#', bass: 4, tones: [0, 4, 7], color: 2 },
    { name: 'Esus4(9)', bass: 7, tones: [7, 0, 2], color: 9 },
    { name: 'Aadd9', bass: 0, tones: [0, 4, 7], color: 2 },
  ],
  // 5 Summer Glare — weight shifts to the subdominant, D-lydian color
  [
    { name: 'Dmaj9(#11)', bass: 5, tones: [5, 9, 0, 4], color: 11 },
    { name: 'A/C#', bass: 4, tones: [0, 4, 7], color: 2 },
    { name: 'Bm9', bass: 2, tones: [2, 5, 9, 0], color: 4 },
    { name: 'Esus4(9)', bass: 7, tones: [7, 0, 2], color: 9 },
  ],
  // 6 Golden Hour — ♭VII mixolydian warmth, the one borrowed tone (G♮)
  [
    { name: 'Aadd9', bass: 0, tones: [0, 4, 7], color: 2 },
    { name: 'G6/9', bass: 10, tones: [10, 2, 5, 7], color: 0 },
    { name: 'D/F#', bass: 9, tones: [5, 9, 0], color: 7 },
    { name: 'Esus4(9)', bass: 7, tones: [7, 0, 2], color: 9 },
  ],
  // 7 Dusk's Edge — vi-centered, the day cooling into F# minor
  [
    { name: 'F#m9', bass: 9, tones: [9, 0, 4, 7], color: 11 },
    { name: 'Dmaj7', bass: 5, tones: [5, 9, 0, 4], color: 7 },
    { name: 'Bm7', bass: 2, tones: [2, 5, 9, 0], color: 4 },
    { name: 'E7sus4', bass: 7, tones: [7, 0, 2, 5], color: 9 },
  ],
  // 8 Night Jasmine — the darkest palette, minor iii under the pedal
  [
    { name: 'F#m11', bass: 9, tones: [9, 0, 4, 7], color: 2 },
    { name: 'C#m7', bass: 4, tones: [4, 7, 11, 2], color: 9 },
    { name: 'Dmaj9#11', bass: 5, tones: [5, 9, 0, 4], color: 11 },
    { name: 'Esus4(9)', bass: 7, tones: [7, 0, 2], color: 9 },
  ],
  // 9 Dreaming of Bliss — home again, richest voicings, slowest harmonic rhythm
  [
    { name: 'Amaj9', bass: 0, tones: [0, 4, 7, 11], color: 2 },
    { name: 'F#m11', bass: 9, tones: [9, 0, 4, 7], color: 2 },
    { name: 'Dmaj9#11', bass: 5, tones: [5, 9, 0, 4], color: 11 },
    { name: 'E7sus4(9)', bass: 7, tones: [7, 0, 2, 5], color: 9 },
  ],
];

// dawn and the coda double the harmonic rhythm for stillness; night slows too
const BARS_PER_CHORD = [4, 2, 2, 2, 2, 2, 2, 2, 3, 4];

/**
 * Species → role in the current chord. `kind` picks which pitch classes are
 * eligible; `center` is the home register (semitones from A3) the octave
 * chooser aims for. Mirrors the physical logic the old fixed pitches had:
 * mass ordering IS register ordering.
 */
const ROLES = {
  watermelon: { kind: 'bass', center: -24 },
  pineapple: { kind: 'bass5', center: -15 },
  orange: { kind: 'tone', slot: 0, center: 0 },
  apple: { kind: 'tone', slot: 1, center: 3 },
  kiwi: { kind: 'tone', slot: 2, center: 8 },
  strawberry: { kind: 'color', center: 24 },
};

/** Nearest realization of pitch class `pc` to register `center`, clamped to
 *  the playable range (G#1 … D#6+1 — the piano kit's comfortable span). The
 *  low clamp is -25, not -24: E/G#'s bass belongs at G#1, a major 7th under
 *  the drone's static A2 partial; G#2 would beat against it at a semitone. */
// the kit's span (G#1 … E6) as named walls — see place() for why LOW is -25
const LOW = -25, TOP = 31;
function place(pc, center) {
  let n = pc + 12 * Math.round((center - pc) / 12);
  while (n < LOW) n += 12;
  while (n > TOP) n -= 12;
  return n;
}

export function createHarmony() {
  let level = 0, pendingLevel = -1;
  let palette = PALETTES[0], idx = 0;

  const api = {
    /** the current chord object (never null) */
    chord: () => palette[idx],
    chordName: () => palette[idx].name,
    barsPerChord: () => BARS_PER_CHORD[level],
    level: () => level,
    levelPending: () => pendingLevel,

    /** New level's palette takes effect at the next chord boundary. */
    setLevel(l) {
      const cl = Math.max(0, Math.min(PALETTES.length - 1, l | 0));
      if (cl !== level) pendingLevel = cl;
    },

    /**
     * Advance the progression one chord (called by the conductor at chord
     * boundaries). Returns true when this advance also switched palettes —
     * the conductor plays the arrival bloom on that signal.
     */
    advance() {
      if (pendingLevel >= 0) {
        level = pendingLevel; pendingLevel = -1;
        palette = PALETTES[level]; idx = 0;
        return true;
      }
      idx = (idx + 1) % palette.length;
      return false;
    },

    reset() { level = 0; pendingLevel = -1; palette = PALETTES[0]; idx = 0; },

    /**
     * The note (semitones from A3) this species plays right now. `climb` is
     * the cross-stroke combo depth (combo-1): repeated hits inside the combo
     * window walk UP through the chord — the old pentatonic ladder's
     * satisfaction, but it can never leave the chord.
     */
    noteFor(speciesId, climb = 0) {
      const chord = palette[idx];
      const role = ROLES[speciesId];
      if (!role) return place(chord.tones[0], 0) + Math.min(2, climb) * 12;
      const c = Math.max(0, climb | 0);
      // bass roles alternate the written bass with the fifth above the chord
      // ROOT (tones[0]) — never "a fifth above the bass", which lands
      // off-chord on inversions like E/G# or A/C#. Every palette chord
      // contains its root's fifth (the probe asserts this stays true).
      const fifth = (chord.tones[0] + 7) % 12;
      if (role.kind === 'bass') {
        const pc = c % 2 === 0 ? chord.bass : fifth;
        return place(pc, role.center + Math.min(2, c) * 5);
      }
      if (role.kind === 'bass5') {
        const pc = c % 2 === 0 ? fifth : chord.bass;
        return place(pc, role.center + Math.min(2, c) * 5);
      }
      if (role.kind === 'color') {
        return place(chord.color, role.center + Math.min(2, c) * 3);
      }
      const n = chord.tones.length;
      const slot = role.slot + c;
      const pc = chord.tones[slot % n];
      // r46: the walk up the chord tops out ONE octave above the role's home.
      // It used to keep climbing (+24, +36 …) with every cut of a combo, which
      // is how a five-fruit stroke voiced kiwi at F6 and strawberry at E9 —
      // pitches the kit can't even render without speeding a sample up.
      return place(pc, role.center + Math.min(1, Math.floor(slot / n)) * 12);
    },

    /**
     * Voice one multi-fruit chord. `entries` = [{id, climb}] in slice order;
     * returns semitone values in the SAME order (caller decides strum order).
     * Two rules keep it beautiful instead of muddy: below E2 only wide
     * intervals (≥ P5) survive, and no two voices may collide closer than a
     * minor third — collisions get lifted an octave.
     */
    voiceChord(entries) {
      const out = new Array(entries.length);
      for (let i = 0; i < entries.length; i++) {
        out[i] = api.noteFor(entries[i].id, entries[i].climb);
      }
      // r46: collisions resolve in BOTH directions, inside the kit's span.
      // The r-early rule lifted a colliding voice +12 and only +12, with no
      // wall: five strawberries came out E5 E6 E7 E8 E9, a mixed five-fruit
      // stroke put 11% of its voices above the top key (measured across all
      // palettes), and a "full" chord read as a chirp. Now each voice, lowest
      // first, takes the nearest free octave — up first (the old lift), then
      // down — and the stroke spreads across the keyboard instead of off it.
      // The low-register law survives: below E2 only wide intervals (≥ P5).
      const order = out.map((n, i) => i).sort((a, b) => out[a] - out[b]);
      const placed = [];
      const gapOk = (n) => placed.every((m) => Math.abs(n - m) >= ((n < E2 || m < E2) ? 7 : 3));
      for (const i of order) {
        const n = out[i];
        let pick = n;
        // every octave the kit has, nearest first (up before down at equal
        // distance) — a fixed short list ran dry on five same-role bass
        // fruit over an inversion and accepted a collision (Codex on #40)
        for (let d = 0; d <= 60; d += 12) {
          const c1 = n + d, c2 = n - d;
          if (c1 >= LOW && c1 <= TOP && gapOk(c1)) { pick = c1; break; }
          if (d > 0 && c2 >= LOW && c2 <= TOP && gapOk(c2)) { pick = c2; break; }
        }
        out[i] = pick;
        placed.push(pick);
      }
      return out;
    },

    /**
     * r46: the FOUNDATION under a 3+ stroke — the chord's written bass in the
     * A1–E2 octave, joined by the fifth above the ROOT for 4+. This is what
     * the player asked for by name ("I want some bass notes in there too"):
     * the old foundation was the lowest chord voice dropped an octave, which
     * on an inverted chord is a third or a fifth in the bass, and on a stroke
     * voiced high it never reached the bass register at all. Root and fifth
     * a P5 apart obey the low-register law by construction.
     */
    foundationNotes(n) {
      const chord = palette[idx];
      const b = place(chord.bass, -22);
      const out = [b];
      if (n >= 4) {
        // the fifth over the ROOT (in every palette chord — the probe holds
        // that), placed above the bass by a wide interval: on an inversion
        // the nearest realization can fall under the bass or a third over
        // it, and below E2 only P5-or-wider survives
        let f = place((chord.tones[0] + 7) % 12, b + 7);
        while (f - b < ((b < E2 || f < E2) ? 7 : 3)) f += 12;
        out.push(f);
      }
      return out;
    },

    /**
     * A melodic degree for the level motifs (conductor.js): degree `d` walks
     * the chord's tones then its color, `oct` shifts register around the
     * octave above middle. Always in-chord, always in the kit's span.
     */
    melNote(d, oct = 0) {
      const chord = palette[idx];
      const set = chord.tones.concat([chord.color]);
      const pc = set[((d % set.length) + set.length) % set.length];
      // ±12 per octave, never less: place() snaps to the NEAREST realization
      // of the pitch class, so any center shift under a tritone can round
      // back to the same note and silently erase an authored rise or fall
      return place(pc, 12 + oct * 12);
    },

    /** Ascending flourish notes for the 5+ combo gliss: chord tones + color
     *  across two octaves, starting just above middle register. Every note is
     *  re-clamped AFTER the octave shifts — the kit's playable span is a hard
     *  wall, not a suggestion. */
    glissNotes() {
      const chord = palette[idx];
      const notes = [];
      for (let oct = 0; oct < 2; oct++) {
        for (const pc of chord.tones) notes.push(place(pc, 10 + oct * 12));
      }
      notes.push(place(chord.color, 27));
      notes.sort((a, b) => a - b);
      return notes.slice(0, 5 + (notes.length > 7 ? 2 : 0));
    },

    /**
     * The GRAND RUN (r26) — the reward for a 4+ harmony, which the player
     * called "quite rare and not really even possible until later levels…
     * it should be rewarded with a more impactful musical event like a
     * longer glissando". Every chord tone realized ascending across
     * `spanOct` octaves from just below middle register, crowned by the
     * color tone an octave above the top — a real harp sweep, longer and
     * wider than glissNotes (which stays as the arp pool). Deduped and
     * sorted; every note in-chord and inside the kit's span by place().
     */
    runNotes(spanOct = 3, floor = -2) {
      const chord = palette[idx];
      const seen = new Set();
      const notes = [];
      for (let oct = 0; oct < spanOct; oct++) {
        for (const pc of chord.tones) {
          const n = place(pc, floor + oct * 12);
          if (n < floor - 6) continue;   // place() folded it under the floor
          if (!seen.has(n)) { seen.add(n); notes.push(n); }
        }
      }
      // r46: the crown is the color tone above the top of the sweep — but the
      // sweep now starts in the bass (audio.js passes floor −22 for a
      // FLOURISH, −10 for a CHORD: "the flourish should span a large range on
      // the keyboard, not just go up up up"), so the crown is placed against
      // the kit's top, never above it, and a run is at most 15 notes.
      const crown = place(chord.color, Math.min(TOP - 2, floor + spanOct * 12));
      if (!seen.has(crown)) notes.push(crown);
      notes.sort((a, b) => a - b);
      // over budget (four-tone chords over 4 octaves): thin the MIDDLE of the
      // sweep, never its ends — the bass floor and the crown are the point
      while (notes.length > 15) notes.splice((notes.length >> 1) - 1, 1);
      return notes;
    },

    /** Pad voicing: `count` voices, root+fifth low then upper tones/color,
     *  register widening with level. Returns semitones from A3, ascending. */
    padNotes(count) {
      const chord = palette[idx];
      // register widens across the 10-level day: dawn sits low and close,
      // evening opens up (thresholds rescaled from the old 6-level table)
      const lowLift = level >= 6 ? 0 : level >= 3 ? -3 : -5;
      const out = [place(chord.bass, -12 + lowLift), place((chord.bass + 7) % 12, -5)];
      const uppers = chord.tones.slice(1).concat([chord.color]);
      for (let i = 0; out.length < count && i < uppers.length; i++) {
        out.push(place(uppers[i], 4 + i * 4 + (level >= 6 ? 3 : 0)));
      }
      out.length = Math.min(out.length, count);
      return out;
    },

    /** The pre-field pentatonic mapping, kept as the guard-rail fallback. */
    fallbackPitch(speciesPitch, combo) {
      return speciesPitch + PENTA[Math.max(0, Math.min(PENTA.length - 1, (combo | 0) - 1))];
    },
  };
  return api;
}

export const semisToFreq = (semis) => 220 * Math.pow(2, semis / 12);
