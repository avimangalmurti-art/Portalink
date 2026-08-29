/**
 * Studio's analytical content. Reach explains how work is found, gaze how much
 * attention it commands, and retention what happens once a piece is opened.
 */
export type ReachIconKey = 'engagement' | 'messages' | 'followers' | 'content' | 'audio' | 'library';
export type ReachMetric = {
  label: string;
  icon: ReachIconKey;
  value: string;
  context: string;
  trend: number[];
  rows: {
    label: string;
    value: string;
    tone?: 'attention';
  }[];
};

/** One diagnostic row per piece, measured in the unit the format implies. */
export type RetentionEntry = {
  piece: string;
  meta: string;
  measure: 'Listening depth' | 'Reading depth' | 'Viewing depth';
  /** Percentage reached, or null while the platform is still gathering data. */
  completion: number | null;
  reached?: string;
  note: string;
  /** Simulating means the figure is still being computed. */
  status?: 'simulating';
  /** Diagnostic emphasis: a real problem, or an unusually strong result. */
  signal?: 'issue' | 'strong';
};
export const gazeCapital = {
  value: '412.5',
  unit: 'Hours Command',
  delta: '+18%',
  deltaContext: 'vs previous period',
  band: [{
    label: 'Profile views',
    value: '1,284',
    delta: '+18%'
  }, {
    label: 'Likes',
    value: '486'
  }, {
    label: 'Saves',
    value: '212'
  }, {
    label: 'Engagement rate',
    value: '6.4%'
  }, {
    label: 'Avg. Gaze Session',
    value: '1m 42s',
    delta: '+12s'
  }],
  density: [{
    day: 'Mon',
    hours: 46
  }, {
    day: 'Tue',
    hours: 62
  }, {
    day: 'Wed',
    hours: 40
  }, {
    day: 'Thu',
    hours: 78
  }, {
    day: 'Fri',
    hours: 58
  }, {
    day: 'Sat',
    hours: 92
  }, {
    day: 'Sun',
    hours: 74
  }]
};
export const reachMetrics: ReachMetric[] = [{
  label: 'Engagement',
  icon: 'engagement',
  value: '1,284 profile views',
  context: '+18% compared with the previous period',
  trend: [46, 62, 40, 78, 58, 92, 74],
  rows: [{
    label: 'Likes',
    value: '486'
  }, {
    label: 'Saves',
    value: '212'
  }, {
    label: 'Engagement rate',
    value: '6.4%'
  }, {
    label: 'Avg. time on profile',
    value: '1m 42s'
  }]
}, {
  label: 'Messages',
  icon: 'messages',
  value: '3 unread',
  context: '92% response rate',
  trend: [28, 44, 36, 52, 30, 48, 40],
  rows: [{
    label: 'New this week',
    value: '11'
  }, {
    label: 'Awaiting reply',
    value: '3',
    tone: 'attention'
  }, {
    label: 'Median response time',
    value: '4h 12m'
  }, {
    label: 'Client enquiries',
    value: '5'
  }]
}, {
  label: 'Followers',
  icon: 'followers',
  value: '8,412 followers',
  context: '+164 compared with the previous period',
  trend: [52, 55, 61, 58, 70, 76, 84],
  rows: [{
    label: 'London',
    value: '22%'
  }, {
    label: 'Cape Town',
    value: '17%'
  }, {
    label: 'New York',
    value: '14%'
  }, {
    label: 'Tokyo',
    value: '9%'
  }]
}, {
  label: 'Content Performance',
  icon: 'content',
  value: 'Typography set — 1.2k views',
  context: '+24% compared with the previous period',
  trend: [38, 70, 54, 88, 66, 94, 80],
  rows: [{
    label: 'Brutalist Type Study',
    value: '342 saves'
  }, {
    label: 'Wet Paint',
    value: '918 views'
  }, {
    label: 'Cool, Calm and Collected',
    value: '774 views'
  }, {
    label: 'imfeelingfont',
    value: '512 views'
  }]
}, {
  label: 'Soundcloud Stats',
  icon: 'audio',
  value: '24,908 plays this month',
  context: '+11% compared with the previous period',
  trend: [44, 58, 50, 64, 72, 60, 86],
  rows: [{
    label: 'Top track — Night Shift',
    value: '6,204 plays'
  }, {
    label: 'Reposts',
    value: '318'
  }, {
    label: 'Avg. completion',
    value: '68%'
  }, {
    label: 'New listeners',
    value: '1,940'
  }]
}, {
  label: 'Content Library',
  icon: 'library',
  value: '6 uploads in the last 14 days',
  context: '48 pieces total',
  trend: [20, 34, 28, 44, 38, 56, 46],
  rows: [{
    label: 'Brutalist Type Study',
    value: '2d ago'
  }, {
    label: 'Harbour House',
    value: '5d ago'
  }, {
    label: 'Wet Paint',
    value: '9d ago'
  }, {
    label: 'Dissociation',
    value: '13d ago'
  }]
}];
/**
 * Retention curves render the depth figures the product already reports: each
 * curve starts at full audience and lands on the piece's known depth, breaking
 * where its average reach sits. No new metrics are introduced.
 */
export type RetentionCurve = {
  axisLabel: string;
  points: {
    position: string;
    percent: number;
  }[];
  /** The position the average audience member reached. */
  annotation: {
    position: string;
    label: string;
  };
};
export const retentionCurves: Record<string, RetentionCurve> = {
  'Loop Studies Vol. 1': {
    axisLabel: 'Listening position',
    points: [{
      position: '0:00',
      percent: 100
    }, {
      position: '7:00',
      percent: 94
    }, {
      position: '14:00',
      percent: 86
    }, {
      position: '18:40',
      percent: 65
    }, {
      position: '23:00',
      percent: 42
    }, {
      position: '28:37',
      percent: 31
    }],
    annotation: {
      position: '18:40',
      label: 'Avg reached 18:40'
    }
  },
  'Checkout Redesign': {
    axisLabel: 'Page',
    points: [{
      position: '1',
      percent: 100
    }, {
      position: '4',
      percent: 92
    }, {
      position: '6',
      percent: 84
    }, {
      position: '8',
      percent: 67
    }, {
      position: '10',
      percent: 54
    }, {
      position: '12',
      percent: 46
    }],
    annotation: {
      position: '8',
      label: 'Avg reached page 8'
    }
  },
  'Harbour House': {
    axisLabel: 'Page',
    points: [{
      position: '1',
      percent: 100
    }, {
      position: '10',
      percent: 88
    }, {
      position: '20',
      percent: 76
    }, {
      position: '21',
      percent: 31
    }, {
      position: '40',
      percent: 22
    }, {
      position: '68',
      percent: 14
    }],
    annotation: {
      position: '21',
      label: 'Sharp drop-off · avg reached page 21'
    }
  },
  'Brutalist Type Study': {
    axisLabel: 'Page',
    points: [{
      position: '1',
      percent: 100
    }, {
      position: '2',
      percent: 98
    }, {
      position: '3',
      percent: 95
    }, {
      position: '4',
      percent: 90
    }, {
      position: '5',
      percent: 83
    }, {
      position: '6',
      percent: 74
    }],
    annotation: {
      position: '5',
      label: 'Avg reached page 5'
    }
  }
};
/** Existing content-performance figures, reusable as a ranked view. */
export const contentReach = [{
  title: 'Wet Paint',
  value: 918,
  unit: 'views'
}, {
  title: 'Cool, Calm and Collected',
  value: 774,
  unit: 'views'
}, {
  title: 'imfeelingfont',
  value: 512,
  unit: 'views'
}];
/** Relative daily activity already held by the reach trends. */
export const timeSeries = {
  gaze: {
    label: 'Gaze Time',
    unit: 'hours',
    delta: '+18%',
    points: gazeCapital.density.map((entry) => ({
      label: entry.day,
      value: entry.hours
    }))
  },
  views: {
    label: 'Profile views',
    unit: 'relative daily activity',
    delta: '+18%',
    points: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => ({
      label: day,
      value: [46, 62, 40, 78, 58, 92, 74][index]
    }))
  },
  followers: {
    label: 'Followers',
    unit: 'relative daily activity',
    delta: '+164',
    points: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => ({
      label: day,
      value: [52, 55, 61, 58, 70, 76, 84][index]
    }))
  },
  plays: {
    label: 'Soundcloud plays',
    unit: 'relative daily activity',
    delta: '+11%',
    points: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => ({
      label: day,
      value: [44, 58, 50, 64, 72, 60, 86][index]
    }))
  }
};
export type TimeSeriesKey = keyof typeof timeSeries;
/** Supporting figures, shown densely rather than as cards of their own. */
export const secondaryMetrics = [{
  label: 'Likes',
  value: '486'
}, {
  label: 'Saves',
  value: '212'
}, {
  label: 'Avg. Gaze Session',
  value: '1m 42s',
  delta: '+12s'
}, {
  label: 'Response rate',
  value: '92%'
}, {
  label: 'Plays',
  value: '24,908'
}, {
  label: 'Library',
  value: '48 pieces'
}];
/**
 * The reporting period. One definition list, owned here: the Studio header's
 * filter is the only visible authority for which window is active, and every
 * figure and series is derived from it. Charts never restate the period.
 *
 * The week is the measured baseline; the other windows are resampled from that
 * same curve rather than being separate hand-written datasets, so a period can
 * never disagree with the metric it belongs to.
 */
export type ReportingPeriodId = 'day' | 'week' | 'month' | 'quarter';
export type ReportingPeriod = {
  id: ReportingPeriodId;
  /** Full label, used by the control and by anything announcing the window. */
  label: string;
  /** Compact label for the segmented control. */
  short: string;
  days: number;
  /** One label per bucket the window is charted in. */
  bucketLabels: string[];
};
export const reportingPeriods: ReportingPeriod[] = [{
  id: 'day',
  label: 'Past day',
  short: 'Day',
  days: 1,
  bucketLabels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00']
}, {
  id: 'week',
  label: 'Past week',
  short: 'Week',
  days: 7,
  bucketLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
}, {
  id: 'month',
  label: 'Past month',
  short: 'Month',
  days: 28,
  bucketLabels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4']
}, {
  id: 'quarter',
  label: 'Past 90 days',
  short: '90 days',
  days: 90,
  bucketLabels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Wk 7', 'Wk 8', 'Wk 9', 'Wk 10', 'Wk 11', 'Wk 12']
}];
export const defaultReportingPeriodId: ReportingPeriodId = 'week';
export function getReportingPeriod(id: ReportingPeriodId): ReportingPeriod {
  return reportingPeriods.find((period) => period.id === id) ?? reportingPeriods[1];
}

/**
 * Resample the measured daily curve onto a window's buckets. Each bucket
 * reports the total for its own span, so a four-hour bucket reads smaller than a
 * weekly one instead of repeating the same number at every zoom.
 */
function resample(daily: number[], period: ReportingPeriod): number[] {
  const buckets = period.bucketLabels.length;
  const spanDays = period.days / buckets;
  return period.bucketLabels.map((_, index) => {
    const position = buckets === 1 ? 0 : index / (buckets - 1) * (daily.length - 1);
    const low = Math.floor(position);
    const high = Math.min(low + 1, daily.length - 1);
    const perDay = daily[low] + (daily[high] - daily[low]) * (position - low);
    const value = perDay * spanDays;
    return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  });
}
const formatDecimal = (value: number) => (Math.round(value * 10) / 10).toLocaleString('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});
const formatInteger = (value: number) => Math.round(value).toLocaleString('en-US');

/**
 * The four headline figures: where each metric stands now, and how it changed.
 * Day-to-day movement is deliberately absent — that is the visualization's
 * responsibility, so a KPI never carries a chart of its own.
 *
 * `window` metrics accumulate over the active period; `snapshot` metrics (a
 * rate, a running total) do not, so they are not scaled.
 */
const kpiDefinitions = [{
  id: 'gaze' as const,
  label: 'Gaze Time',
  base: 412.5,
  suffix: 'hrs',
  kind: 'window' as const,
  format: formatDecimal,
  delta: '+18%',
  deltaScales: false
}, {
  id: 'views' as const,
  label: 'Profile views',
  base: 1284,
  kind: 'window' as const,
  format: formatInteger,
  delta: '+18%',
  deltaScales: false
}, {
  id: 'engagement' as const,
  label: 'Engagement',
  base: 6.4,
  kind: 'snapshot' as const,
  format: (value: number) => `${formatDecimal(value)}%`
}, {
  id: 'audience' as const,
  label: 'Audience',
  base: 8412,
  kind: 'snapshot' as const,
  format: formatInteger,
  // The follower count is cumulative, but how many arrived scales with the window.
  delta: '+164',
  deltaScales: true
}];
export function kpisForPeriod(periodId: ReportingPeriodId) {
  const period = getReportingPeriod(periodId);
  const factor = period.days / 7;
  return kpiDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    suffix: definition.suffix,
    value: definition.format(definition.kind === 'window' ? definition.base * factor : definition.base),
    delta: definition.delta ? definition.deltaScales ? `+${formatInteger(Number(definition.delta.replace(/[^\d.]/g, '')) * factor)}` : definition.delta : undefined
  }));
}
export type PrimaryKpi = ReturnType<typeof kpisForPeriod>[number];

/** The same measured series, charted over the active window. */
export function timeSeriesForPeriod(key: TimeSeriesKey, periodId: ReportingPeriodId) {
  const series = timeSeries[key];
  const period = getReportingPeriod(periodId);
  const values = resample(series.points.map((point) => point.value), period);
  return {
    label: series.label,
    unit: series.unit,
    delta: series.delta,
    points: period.bucketLabels.map((label, index) => ({
      label,
      value: values[index]
    }))
  };
}
export const retentionEntries: RetentionEntry[] = [{
  piece: 'Loop Studies Vol. 1',
  meta: 'Audio · 28:37',
  measure: 'Listening depth',
  completion: 65,
  reached: 'Avg reached 18:40',
  note: 'Listening drops near final third due to lack of high-frequency rhythmic variations.'
}, {
  piece: 'Checkout Redesign',
  meta: 'Case study · 12 pages',
  measure: 'Reading depth',
  completion: 67,
  reached: 'Avg reached page 8',
  note: 'Strong retention through middle document layout.'
}, {
  piece: 'Harbour House',
  meta: 'Document · 68 pages',
  measure: 'Reading depth',
  completion: 31,
  reached: 'Avg reached page 21',
  note: 'Critical drop-off at page 21. Layout density increased text by 45% here.',
  signal: 'issue'
}, {
  piece: 'Brutalist Type Study',
  meta: 'Graphic design · 6 pages',
  measure: 'Reading depth',
  completion: 83,
  reached: 'Avg reached page 5',
  note: 'Outstanding retention. Page 5 asymmetric grid triggered deep visual exploration.',
  signal: 'strong'
}, {
  piece: 'Wet Paint Poster series',
  meta: 'Poster series',
  measure: 'Viewing depth',
  completion: null,
  note: 'Insatiable baseline focus data. Simulating Gaze...',
  status: 'simulating'
}, {
  piece: 'Dissociation',
  meta: 'Graphic design',
  measure: 'Viewing depth',
  completion: null,
  note: 'Insatiable baseline focus data. Simulating Gaze...',
  status: 'simulating'
}];