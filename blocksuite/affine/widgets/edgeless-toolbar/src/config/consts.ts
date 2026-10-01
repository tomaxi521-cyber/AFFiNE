import { StyleGeneralIcon, StyleScribbleIcon } from '@blocksuite/icons/lit';

import type { MenuItem } from './types';

export const LINE_STYLE_LIST = [
  {
    key: '常规',
    value: false,
    icon: StyleGeneralIcon(),
  },
  {
    key: '手绘',
    value: true,
    icon: StyleScribbleIcon(),
  },
] as const satisfies MenuItem<boolean>[];
