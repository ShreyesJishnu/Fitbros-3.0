/**
 * The FitBros 3.0 rules, as the group agreed them.
 *
 * Lifted from the shared rulebook the group agreed on, so the app and the
 * document cannot drift into saying different things. If a rule changes, it
 * changes in both places together.
 *
 * `ties` records which other rules a rule leans on — the fine is only legible
 * next to the logging rule, and the app should let people follow that.
 */

export interface Rule {
  id: string;
  number: string;
  title: string;
  /** Which part of the season this rule belongs to. */
  stage: string;
  /** One line, for scanning. */
  summary: string;
  paragraphs: string[];
  points: string[];
  /** Rows of a small table, where the rule has one (prices, tiers). */
  table: string[][];
  /** Ids of the rules this one depends on. */
  ties: string[];
}

export const ALL_RULES: Rule[] = [
  {
    id: "r1",
    number: "01",
    title: "Goals",
    stage: "Before you start",
    summary: "Physical, numbered, provable. Nothing you eat or sleep.",
    paragraphs: [
      "Your own categories, no fixed slots. Every goal is physical output, measured by a number — reps, kg, minutes, sessions, distance, time — and provable by an app log, a timestamp or a photo.",
      "Goals carry no weight and cost nothing. Set as many or as few as keep you moving — they are yours to chase, and only you decide what is worth chasing.",
      "Bodyweight isn't a goal. It's a state, not an output. Train right and it follows."],
    points: [],
    table: [],
    ties: [],
  },
  {
    id: "r5",
    number: "02",
    title: "Logging",
    stage: "Week to week",
    summary: "One shared sheet. A session is a workout, 10k steps is half.",
    paragraphs: [
      "One sheet, single source of truth. A session counts if logged before your cutoff on the day you did it — Hevy, Strava, Apple Watch, Google Fit and timestamped photos are all accepted."],
    points: [
      "A session — anything you would call training — is 1",
      "A 10k-step day is ½, so two make a workout",
      "A day is logged once, so a week can't be walked clean",
      "4 a week is clean, however you get there"],
    table: [],
    ties: ["r7"],
  },
  {
    id: "r7",
    number: "03",
    title: "Fines",
    stage: "When you miss",
    summary: "₹200 to start. Two misses at a price, then it doubles.",
    paragraphs: [
      "A miss costs ₹200. Two missed weeks at one price and the price doubles, with no ceiling. Two clean weeks in a row halve it back."],
    points: [
      "A fine is due within 48 hours",
      "Nothing is taken away when that passes — you simply still owe it"],
    table: [
      ["First two misses", "₹200"],
      ["Next two", "₹400"],
      ["Then", "₹800, ₹1,600, ₹3,200 …"]],
    ties: ["r5", "r11"],
  },
  {
    id: "r11",
    number: "04",
    title: "Winning",
    stage: "How it ends",
    summary: "Everyone with nothing owing splits the pot.",
    paragraphs: [],
    points: [
      "The prize pot splits between everyone who ends the season with nothing left owing. A fined week doesn't cost you a share; it only costs you the fine.",
    ],
    table: [],
    ties: ["r7"],
  },
];
