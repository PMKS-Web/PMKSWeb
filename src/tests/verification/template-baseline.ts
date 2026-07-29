// PMKS+'s own decoded topology and solved joint positions for the five built-in
// templates, captured on staging before the Phase 0 solver refactor.
//
// This is NOT verification data: nothing here is checked against MATLAB or the
// PMKS fork (that lives in src/test-data/verification/). It is a self-snapshot
// whose only job is to fail loudly if a refactor changes what an existing
// shared URL decodes or solves to. The URL codec is a compatibility surface —
// every link anyone has ever shared depends on these numbers.
//
// Regenerate ONLY when a change to the numbers is intended and reviewed.

export interface TemplateJointSnapshot {
  id: string;
  type: number;
  x: number;
  y: number;
  isGrounded: boolean;
  isInput: boolean;
  isWelded: boolean;
  angleRadians: number;
}

export interface TemplateLinkSnapshot {
  id: string;
  type: number;
  jointIDs: string[];
  subsetLinkIDs: string[];
}

export interface TemplateBaseline {
  joints: TemplateJointSnapshot[];
  links: TemplateLinkSnapshot[];
  /** Solved timestep count. */
  steps: number;
  /** Timestep indices the samples were taken at. */
  picks: number[];
  /** Per pick: [jointId, x, y] for every joint, in mechanism order. */
  samples: [string, number, number][][];
}

export const TEMPLATE_BASELINES: Record<string, TemplateBaseline> = {
  '4-Bar': {
    joints: [
      {
        id: 'A',
        type: 1,
        x: -3.129,
        y: -2.014,
        isGrounded: true,
        isInput: true,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'B',
        type: 1,
        x: -2.622,
        y: 0.902,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'C',
        type: 1,
        x: 3.009,
        y: 2.08,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'D',
        type: 1,
        x: 3.341,
        y: -1.646,
        isGrounded: true,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
    ],
    links: [
      {
        id: 'AB',
        type: 0,
        jointIDs: ['A', 'B'],
        subsetLinkIDs: [],
      },
      {
        id: 'BC',
        type: 0,
        jointIDs: ['B', 'C'],
        subsetLinkIDs: [],
      },
      {
        id: 'CD',
        type: 0,
        jointIDs: ['C', 'D'],
        subsetLinkIDs: [],
      },
    ],
    steps: 361,
    picks: [0, 90, 180, 270],
    samples: [
      [
        ['A', -3.129, -2.014],
        ['B', -2.622, 0.902],
        ['C', 3.009, 2.08],
        ['D', 3.341, -1.646],
      ],
      [
        ['A', -3.129, -2.014],
        ['B', -0.213, -2.5209],
        ['C', 3.2234, 2.0929],
        ['D', 3.341, -1.646],
      ],
      [
        ['A', -3.129, -2.014],
        ['B', -3.6359, -4.93],
        ['C', -0.1651, -0.342],
        ['D', 3.341, -1.646],
      ],
      [
        ['A', -3.129, -2.014],
        ['B', -6.045, -1.5071],
        ['C', -0.3244, -0.8987],
        ['D', 3.341, -1.646],
      ],
    ],
  },
  Watt_I: {
    joints: [
      {
        id: 'A',
        type: 1,
        x: -1.707,
        y: -1.329,
        isGrounded: true,
        isInput: true,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'B',
        type: 1,
        x: -2.561,
        y: 0.62,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'C',
        type: 1,
        x: 2.397,
        y: 1.359,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'D',
        type: 1,
        x: -1.029,
        y: 3.555,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'E',
        type: 1,
        x: 1.989,
        y: 8.125,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'F',
        type: 1,
        x: 7.19,
        y: 5.177,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'G',
        type: 1,
        x: 7.543,
        y: -2.62,
        isGrounded: true,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
    ],
    links: [
      {
        id: 'AB',
        type: 0,
        jointIDs: ['A', 'B'],
        subsetLinkIDs: [],
      },
      {
        id: 'BCD',
        type: 0,
        jointIDs: ['B', 'C', 'D'],
        subsetLinkIDs: [],
      },
      {
        id: 'DE',
        type: 0,
        jointIDs: ['D', 'E'],
        subsetLinkIDs: [],
      },
      {
        id: 'EF',
        type: 0,
        jointIDs: ['E', 'F'],
        subsetLinkIDs: [],
      },
      {
        id: 'FCG',
        type: 0,
        jointIDs: ['F', 'C', 'G'],
        subsetLinkIDs: [],
      },
    ],
    steps: 361,
    picks: [0, 90, 180, 270],
    samples: [
      [
        ['A', -1.707, -1.329],
        ['B', -2.561, 0.62],
        ['C', 2.397, 1.359],
        ['D', -1.029, 3.555],
        ['E', 1.989, 8.125],
        ['F', 7.19, 5.177],
        ['G', 7.543, -2.62],
      ],
      [
        ['A', -1.707, -1.329],
        ['B', 0.2419, -0.4747],
        ['C', 4.0041, 2.838],
        ['D', -0.0653, 2.8218],
        ['E', 4.0311, 6.4568],
        ['F', 9.7907, 4.8543],
        ['G', 7.543, -2.62],
      ],
      [
        ['A', -1.707, -1.329],
        ['B', -0.8527, -3.2779],
        ['C', 2.0258, 0.826],
        ['D', -1.9258, -0.1459],
        ['E', 0.4439, 4.7915],
        ['F', 6.4142, 5.1029],
        ['G', 7.543, -2.62],
      ],
      [
        ['A', -1.707, -1.329],
        ['B', -3.6559, -2.1833],
        ['C', 1.2287, -1.0569],
        ['D', -2.3593, 0.863],
        ['E', -1.591, 6.2854],
        ['F', 4.0726, 4.371],
        ['G', 7.543, -2.62],
      ],
    ],
  },
  Watt_II: {
    joints: [
      {
        id: 'A',
        type: 1,
        x: -2.025,
        y: -2.023,
        isGrounded: true,
        isInput: true,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'B',
        type: 1,
        x: -3.107,
        y: -0.522,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'C',
        type: 1,
        x: -0.418,
        y: 1.356,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'D',
        type: 1,
        x: 5.531,
        y: 1.218,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'E',
        type: 1,
        x: 3.45,
        y: -2.882,
        isGrounded: true,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'F',
        type: 1,
        x: 11.046,
        y: 1.165,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'G',
        type: 1,
        x: 11.246,
        y: -2.295,
        isGrounded: true,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
    ],
    links: [
      {
        id: 'AB',
        type: 0,
        jointIDs: ['A', 'B'],
        subsetLinkIDs: [],
      },
      {
        id: 'BC',
        type: 0,
        jointIDs: ['B', 'C'],
        subsetLinkIDs: [],
      },
      {
        id: 'CDE',
        type: 0,
        jointIDs: ['C', 'D', 'E'],
        subsetLinkIDs: [],
      },
      {
        id: 'DF',
        type: 0,
        jointIDs: ['D', 'F'],
        subsetLinkIDs: [],
      },
      {
        id: 'FG',
        type: 0,
        jointIDs: ['F', 'G'],
        subsetLinkIDs: [],
      },
    ],
    steps: 361,
    picks: [0, 90, 180, 270],
    samples: [
      [
        ['A', -2.025, -2.023],
        ['B', -3.107, -0.522],
        ['C', -0.418, 1.356],
        ['D', 5.531, 1.218],
        ['E', 3.45, -2.882],
        ['F', 11.046, 1.165],
        ['G', 11.246, -2.295],
      ],
      [
        ['A', -2.025, -2.023],
        ['B', -0.5239, -0.9411],
        ['C', 0.645, 2.1234],
        ['D', 6.4074, 0.6386],
        ['E', 3.45, -2.882],
        ['F', 11.9026, 1.108],
        ['G', 11.246, -2.295],
      ],
      [
        ['A', -2.025, -2.023],
        ['B', -0.9433, -3.5242],
        ['C', -1.6891, -0.3302],
        ['D', 3.907, 1.6931],
        ['E', 3.45, -2.882],
        ['F', 9.3085, 0.5786],
        ['G', 11.246, -2.295],
      ],
      [
        ['A', -2.025, -2.023],
        ['B', -3.5262, -3.1047],
        ['C', -1.7103, -0.3734],
        ['D', 3.8686, 1.6968],
        ['E', 3.45, -2.882],
        ['F', 9.2627, 0.5472],
        ['G', 11.246, -2.295],
      ],
    ],
  },
  Stephenson_III: {
    joints: [
      {
        id: 'A',
        type: 1,
        x: -2.201,
        y: -2.472,
        isGrounded: true,
        isInput: true,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'B',
        type: 1,
        x: -2.458,
        y: -0.978,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'C',
        type: 1,
        x: 3.02,
        y: 0.127,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'D',
        type: 1,
        x: 3.258,
        y: -1.921,
        isGrounded: true,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'E',
        type: 1,
        x: -0.195,
        y: 0.895,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'F',
        type: 1,
        x: 0.87,
        y: 3.181,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'G',
        type: 1,
        x: 5.504,
        y: 1.043,
        isGrounded: true,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
    ],
    links: [
      {
        id: 'AB',
        type: 0,
        jointIDs: ['A', 'B'],
        subsetLinkIDs: [],
      },
      {
        id: 'BCE',
        type: 0,
        jointIDs: ['B', 'C', 'E'],
        subsetLinkIDs: [],
      },
      {
        id: 'CD',
        type: 0,
        jointIDs: ['C', 'D'],
        subsetLinkIDs: [],
      },
      {
        id: 'EF',
        type: 0,
        jointIDs: ['E', 'F'],
        subsetLinkIDs: [],
      },
      {
        id: 'FG',
        type: 0,
        jointIDs: ['F', 'G'],
        subsetLinkIDs: [],
      },
    ],
    steps: 361,
    picks: [0, 90, 180, 270],
    samples: [
      [
        ['A', -2.201, -2.472],
        ['B', -2.458, -0.978],
        ['C', 3.02, 0.127],
        ['D', 3.258, -1.921],
        ['E', -0.195, 0.895],
        ['F', 0.87, 3.181],
        ['G', 5.504, 1.043],
      ],
      [
        ['A', -2.201, -2.472],
        ['B', -0.707, -2.2149],
        ['C', 4.5474, -0.3122],
        ['D', 3.258, -1.921],
        ['E', 1.2542, -0.0279],
        ['F', 0.5853, 2.4037],
        ['G', 5.504, 1.043],
      ],
      [
        ['A', -2.201, -2.472],
        ['B', -1.9439, -3.966],
        ['C', 2.1618, -0.1748],
        ['D', 3.258, -1.921],
        ['E', -0.984, -1.1897],
        ['F', 0.4021, 0.9171],
        ['G', 5.504, 1.043],
      ],
      [
        ['A', -2.201, -2.472],
        ['B', -3.695, -2.7291],
        ['C', 1.5418, -0.7784],
        ['D', 3.258, -1.921],
        ['E', -1.7539, -0.5243],
        ['F', 0.4076, 0.7749],
        ['G', 5.504, 1.043],
      ],
    ],
  },
  Slider_Crank: {
    joints: [
      {
        id: 'A',
        type: 1,
        x: -3.082,
        y: -0.038,
        isGrounded: true,
        isInput: true,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'B',
        type: 1,
        x: -2.231,
        y: 2.388,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'C',
        type: 1,
        x: 2.863,
        y: 1.151,
        isGrounded: false,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
      {
        id: 'D',
        type: 0,
        x: 2.863,
        y: 1.151,
        isGrounded: true,
        isInput: false,
        isWelded: false,
        angleRadians: 0,
      },
    ],
    links: [
      {
        id: 'AB',
        type: 0,
        jointIDs: ['A', 'B'],
        subsetLinkIDs: [],
      },
      {
        id: 'BC',
        type: 0,
        jointIDs: ['B', 'C'],
        subsetLinkIDs: [],
      },
      {
        id: 'CD',
        type: 1,
        jointIDs: ['C', 'D'],
        subsetLinkIDs: [],
      },
    ],
    steps: 361,
    picks: [0, 90, 180, 270],
    samples: [
      [
        ['A', -3.082, -0.038],
        ['B', -2.231, 2.388],
        ['C', 2.863, 1.151],
        ['D', 2.863, 1.151],
      ],
      [
        ['A', -3.082, -0.038],
        ['B', -0.6559, -0.8888],
        ['C', 4.173, 1.151],
        ['D', 4.173, 1.151],
      ],
      [
        ['A', -3.082, -0.038],
        ['B', -3.9328, -2.4641],
        ['C', -0.1367, 1.151],
        ['D', -0.1367, 1.151],
      ],
      [
        ['A', -3.082, -0.038],
        ['B', -5.5081, 0.8128],
        ['C', -0.277, 1.151],
        ['D', -0.277, 1.151],
      ],
    ],
  },
};
