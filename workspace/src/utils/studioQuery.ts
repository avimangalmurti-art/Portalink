import { retentionEntries } from '../data/studioAnalytics';
import type { TimeSeriesKey } from '../data/studioAnalytics';

/** What the analytical stage is currently showing. */
export type StageView = {
  kind: 'timeseries';
  metric: TimeSeriesKey;
} | {
  kind: 'ranking';
  metric: 'depth' | 'views';
} | {
  kind: 'retention';
  piece: string;
} | {
  kind: 'comparison';
  metric: 'depth' | 'views';
  pieces: string[];
};

/** Generative actions already available in Studio, surfaced contextually. */
export type StudioActionKey = 'layout-revision' | 'simulate-draft' | 'synthesize' | null;
export type QueryResult = {
  view: StageView;
  /** One short conclusion; the evidence lives on the stage. */
  reply: string;
  observation?: string;
  action: StudioActionKey;
};
export const defaultView: StageView = {
  kind: 'timeseries',
  metric: 'gaze'
};

/** The four headline metrics the KPI cards select between. */
export type PrimaryKpiId = 'gaze' | 'views' | 'engagement' | 'audience';

/**
 * The single mapping from a primary KPI to the stage it puts on the canvas.
 * Both the KPI card's action and its selected state resolve from here, so the
 * selected metric has exactly one source of truth.
 */
export function kpiStageView(id: PrimaryKpiId): StageView {
  if (id === 'engagement') {
    return {
      kind: 'ranking',
      metric: 'depth'
    };
  }
  return {
    kind: 'timeseries',
    metric: id === 'audience' ? 'followers' : id
  };
}

/** Derived, never stored: is this KPI the one currently on the stage? */
export function isKpiActive(id: PrimaryKpiId, view: StageView): boolean {
  const target = kpiStageView(id);
  return target.kind === view.kind && 'metric' in target && 'metric' in view && target.metric === view.metric;
}
const newestThree = ['Brutalist Type Study', 'Harbour House', 'Checkout Redesign'];

/**
 * Reads a natural-language request as a command on the analytical workspace.
 * Every answer resolves to a visualization first and a sentence second.
 */
export function interpretQuery(text: string, current: StageView): QueryResult {
  const query = text.toLowerCase();
  const mentions = (...terms: string[]) => terms.some((term) => query.includes(term));
  if (mentions('harbour')) {
    return harbourHouseResult();
  }
  if (mentions('fix', 'revise', 'revision') && current.kind === 'retention' && current.piece === 'Harbour House') {
    return harbourHouseResult();
  }
  if (mentions('wet paint', 'draft', 'simulate', 'simulation', 'pre-check')) {
    return {
      view: current,
      reply: 'Wet Paint Poster series has no published Gaze baseline yet.',
      observation: 'Simulating gaze from draft components will give it a projection before publishing.',
      action: 'simulate-draft'
    };
  }
  if (mentions('soundcloud', 'cross', 'synth', 'overlap', 'trailer')) {
    return {
      view: {
        kind: 'ranking',
        metric: 'depth'
      },
      reply: 'Brutalist Type Study and Soundcloud Stats show meaningful audience overlap.',
      action: 'synthesize'
    };
  }
  if (mentions('drop', 'leaving', 'leave', 'abandon', 'retention', 'depth', 'finish')) {
    // The steepest known decline is the one worth opening first.
    const weakest = retentionEntries.filter((entry) => entry.completion !== null).sort((a, b) => (a.completion ?? 0) - (b.completion ?? 0))[0];
    return weakest.piece === 'Harbour House' ? harbourHouseResult() : {
      view: {
        kind: 'retention',
        piece: weakest.piece
      },
      reply: `${weakest.piece} loses the most audience of your published work.`,
      action: null
    };
  }
  if (mentions('compare', 'comparison', 'versus', 'vs ')) {
    return {
      view: {
        kind: 'comparison',
        metric: mentions('view', 'reach') ? 'views' : 'depth',
        pieces: newestThree
      },
      reply: 'Brutalist Type Study leads your three newest pieces on retention.',
      observation: 'Wet Paint Poster series is still simulating, so it has no comparable figure yet.',
      action: null
    };
  }
  if (mentions('attention', 'longest', 'most time', 'holding', 'holds', 'best', 'top', 'highest', 'strongest', 'rank')) {
    return {
      view: {
        kind: 'ranking',
        metric: mentions('view', 'reach') ? 'views' : 'depth'
      },
      reply: 'Brutalist Type Study is currently holding the most attention.',
      action: null
    };
  }
  if (mentions('gaze')) {
    return {
      view: {
        kind: 'timeseries',
        metric: 'gaze'
      },
      reply: 'Gaze Time is 412.5 hours, up 18% on the previous period.',
      action: null
    };
  }
  if (mentions('follower', 'audience')) {
    return {
      view: {
        kind: 'timeseries',
        metric: 'followers'
      },
      reply: 'Followers grew by 164 across the period.',
      action: null
    };
  }
  if (mentions('play', 'listen', 'audio', 'track')) {
    return {
      view: {
        kind: 'timeseries',
        metric: 'plays'
      },
      reply: 'Soundcloud plays are up 11% on the previous period.',
      action: null
    };
  }
  if (mentions('view', 'reach', 'profile')) {
    return {
      view: {
        kind: 'timeseries',
        metric: 'views'
      },
      reply: 'Profile views reached 1,284, up 18% on the previous period.',
      action: null
    };
  }
  if (mentions('chang', 'week', 'summar', 'landing', 'performing', 'perform')) {
    return {
      view: {
        kind: 'timeseries',
        metric: 'gaze'
      },
      reply: 'Gaze Time is up 18%, with Saturday commanding the most attention.',
      observation: 'Profile views moved the same way; retention is where the variance sits.',
      action: null
    };
  }
  return {
    view: current,
    reply: 'I can show Gaze Time over the period, rank attention by piece, or open where readers drop off.',
    action: null
  };
}
function harbourHouseResult(): QueryResult {
  return {
    view: {
      kind: 'retention',
      piece: 'Harbour House'
    },
    reply: 'The sharpest decline begins at page 21.',
    observation: 'Layout density increased text by 45% there; readers average page 21 of 68.',
    action: 'layout-revision'
  };
}

/** Follow-ups after an answer: connected to what was just discovered. */
export function suggestionsFor(view: StageView): {
  label: string;
  questions: string[];
} {
  if (view.kind === 'retention') {
    return {
      label: 'Go deeper',
      questions: ['Why does attention drop there?', 'Compare it with my strongest project', 'Show me page-level retention']
    };
  }
  if (view.kind === 'ranking') {
    return {
      label: 'Go deeper',
      questions: ['Where are readers dropping off?', 'What is working in my strongest piece?', 'Compare my newest work']
    };
  }
  if (view.kind === 'comparison') {
    return {
      label: 'Go deeper',
      questions: ['Which pieces hold attention longest?', 'Where are readers dropping off?', 'What changed this week?']
    };
  }
  return {
    label: 'Explore',
    questions: ['Which pieces hold attention longest?', 'What am I overlooking in my own work?', 'Where are readers dropping off?']
  };
}

/**
 * Starter prompts span three kinds of curiosity: the creator's own work,
 * creators around them, and the wider landscape. Index 0 is the first view.
 */
const explorePools: string[][] = [['What should I know about my creative world today?', 'What are creators like me getting attention for?', 'What’s changing in how people discover creative work?', 'What am I overlooking in my own work?'], ['What surprised you in my work this week?', 'Which formats are holding attention for creators like me?', 'Are people spending more time with short or long-form work?', 'Which piece is behaving differently from the others?'], ['What changed in my audience recently?', 'What are creators in my space experimenting with?', 'Which content formats seem to be gaining attention?', 'What is getting attention that I might be overlooking?'], ['What should I look at more closely?', 'Where does my work differ from similar creators?', 'What creative patterns are starting to emerge?', 'What seems to be gaining momentum among creators right now?']];
export function explorePrompts(rotation: number): string[] {
  return explorePools[Math.abs(rotation) % explorePools.length];
}

/** One insight at a time, always derived from figures Studio already holds. */
export type ForYouInsight = {
  emphasis: string;
  text: string;
  tone: 'gaze' | 'success' | 'warning' | 'affinity';
  prompt: string;
  question: string;
};
const forYouInsights: ForYouInsight[] = [{
  emphasis: 'up 18%',
  text: 'Gaze Time is {emphasis} this week.',
  tone: 'success',
  prompt: 'Find out why',
  question: 'What changed this week?'
}, {
  emphasis: '83% retention',
  text: 'Brutalist Type Study is holding {emphasis} — unusually strong.',
  tone: 'gaze',
  prompt: 'Explore what’s working',
  question: 'Which pieces hold attention longest?'
}, {
  emphasis: 'page 21',
  text: 'Harbour House loses attention sharply at {emphasis}.',
  tone: 'warning',
  prompt: 'See the drop-off',
  question: 'Where are readers leaving Harbour House?'
}, {
  emphasis: '+164',
  text: 'Your audience grew by {emphasis} across the period.',
  tone: 'affinity',
  prompt: 'Compare recent projects',
  question: 'Compare my newest work'
}];
export function forYouInsight(rotation: number): ForYouInsight {
  return forYouInsights[Math.abs(rotation) % forYouInsights.length];
}

/** Only contexts the product genuinely holds. */
export const studioContexts = ['Your work', 'Your audience', 'Your projects', 'Portalink'] as const;