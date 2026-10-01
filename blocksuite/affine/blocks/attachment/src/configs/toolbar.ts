import { createLitPortal } from '@blocksuite/affine-components/portal';
import {
  AttachmentBlockModel,
  defaultAttachmentProps,
  type EmbedCardStyle,
} from '@blocksuite/affine-model';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import {
  ActionPlacement,
  type ToolbarAction,
  type ToolbarActionGroup,
  type ToolbarModuleConfig,
  type ToolbarContext,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { getBlockProps } from '@blocksuite/affine-shared/utils';
import { Bound } from '@blocksuite/global/gfx';
import {
  CaptionIcon,
  CopyIcon,
  DeleteIcon,
  DownloadIcon,
  DuplicateIcon,
  EditIcon,
  ReplaceIcon,
  ResetIcon,
  EdgelessIcon,
  PlayIcon,
} from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { flip, offset } from '@floating-ui/dom';
import { computed } from '@preact/signals-core';
import { html } from 'lit';
import { keyed } from 'lit/directives/keyed.js';

import { AttachmentBlockComponent } from '../attachment-block';
import { RenameModal } from '../components/rename-model';
import { AttachmentEmbedProvider } from '../embed';
import { isOfflineHtml, offlineHtmlScale } from '../offline-html';

const isHtml = (ctx: ToolbarContext) => {
  const model = ctx.getCurrentModelByType(AttachmentBlockModel);
  return !!model && isOfflineHtml(model.props);
};
const isHtmlEmbed = (ctx: ToolbarContext) =>
  isHtml(ctx) && !!ctx.getCurrentModelByType(AttachmentBlockModel)?.props.embed;
const htmlInteraction = {
  id: 'a.html-interaction',
  when: isHtmlEmbed,
  content(ctx) {
    const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
    if (!block) return null;
    const state = block.offlineHtmlState$.value;
    const label = state.active
      ? '退出操作'
      : state.running
        ? '进入操作'
        : '运行 HTML';
    return html`<editor-icon-button
      data-testid="dikw-html-interaction"
      aria-label=${label}
      .tooltip=${label}
      ?active=${state.active}
      ?disabled=${ctx.store.readonly || state.loading}
      @pointerdown=${(e: Event) => e.stopPropagation()}
      @click=${block.toggleOfflineHtml}
      >${state.active ? EdgelessIcon() : PlayIcon()}</editor-icon-button
    >`;
  },
} satisfies ToolbarAction;
const htmlScaleAction = {
  id: 'g.html-scale',
  when: isHtmlEmbed,
  content(ctx) {
    const model = ctx.getCurrentModelByType(AttachmentBlockModel);
    if (!model) return null;
    const scale$ = computed(() =>
      Math.round(100 * offlineHtmlScale(model.props.offlineHtmlScale$.value))
    );
    const select = (event: CustomEvent<number>) => {
      event.stopPropagation();
      const scale = event.detail / 100;
      if (
        !Number.isFinite(scale) ||
        scale < 0.1 ||
        scale > 5 ||
        ctx.store.readonly
      )
        return;
      const ratio = scale / offlineHtmlScale(model.props.offlineHtmlScale);
      const bound = Bound.deserialize(model.xywh);
      bound.w *= ratio;
      bound.h *= ratio;
      ctx.store.updateBlock(model, {
        offlineHtmlScale: scale,
        xywh: bound.serialize(),
      });
    };
    return html`${keyed(
      model,
      html`<affine-size-dropdown-menu
        data-testid="dikw-html-scale"
        .tooltip=${'Scale'}
        @select=${select}
        .format=${(n: number) => `${n}%`}
        .sizeSignal=${scale$}
      ></affine-size-dropdown-menu>`
    )}`;
  },
} satisfies ToolbarAction;

const trackBaseProps = {
  category: 'attachment',
  type: 'card view',
};

export const attachmentViewDropdownMenu = {
  id: 'b.conversions',
  actions: [
    {
      id: 'card',
      label: 'Card view',
      run(ctx) {
        const model = ctx.getCurrentModelByType(AttachmentBlockModel);
        if (!model) return;

        const style = defaultAttachmentProps.style!;
        const width = EMBED_CARD_WIDTH[style];
        const height = EMBED_CARD_HEIGHT[style];
        const bounds = Bound.deserialize(model.xywh);
        bounds.w = width;
        bounds.h = height;

        ctx.store.updateBlock(model, {
          style,
          embed: false,
          xywh: bounds.serialize(),
        });
      },
    },
    {
      id: 'embed',
      label: 'Embed view',
      disabled: ctx => {
        const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
        return block ? !block.embedded() : true;
      },
      run(ctx) {
        const model = ctx.getCurrentModelByType(AttachmentBlockModel);
        if (!model) return;

        const provider = ctx.std.get(AttachmentEmbedProvider);

        // TODO(@fundon): should auto focus image block.
        if (
          provider.shouldBeConverted(model) &&
          !ctx.hasSelectedSurfaceModels
        ) {
          // Clears
          ctx.reset();
          ctx.select('note');
        }

        provider.convertTo(model);

        ctx.track('SelectedView', {
          ...trackBaseProps,
          control: 'select view',
          type: 'embed view',
        });
      },
    },
  ],
  content(ctx) {
    const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
    if (!block) return null;

    const model = block.model;
    const embedProvider = ctx.std.get(AttachmentEmbedProvider);
    const actions = computed(() => {
      const [cardAction, embedAction] = this.actions.map(action => ({
        ...action,
      }));

      const ok = block.resourceController.resolvedState$.value.state === 'none';
      const sourceId = Boolean(model.props.sourceId$.value);
      const embed = model.props.embed$.value ?? false;
      // 1. Check whether `sourceId` exists.
      // 2. Check if `embedded` is allowed.
      // 3. Check `blobState$`
      const allowed = ok && sourceId && embedProvider.embedded(model) && !embed;

      cardAction.disabled = !embed;
      embedAction.disabled = !allowed;

      return [cardAction, embedAction];
    });
    const viewType$ = computed(() => {
      const [cardAction, embedAction] = actions.value;
      const embed = model.props.embed$.value ?? false;
      return embed ? embedAction.label : cardAction.label;
    });
    const onToggle = (e: CustomEvent<boolean>) => {
      e.stopPropagation();
      const opened = e.detail;
      if (!opened) return;

      ctx.track('OpenedViewSelector', {
        ...trackBaseProps,
        control: 'switch view',
      });
    };

    return html`<affine-view-dropdown-menu
      @toggle=${onToggle}
      .actions=${actions.value}
      .context=${ctx}
      .viewTypeSignal=${viewType$}
    ></affine-view-dropdown-menu>`;
  },
} as const satisfies ToolbarActionGroup<ToolbarAction>;

const replaceAction = {
  id: 'c.replace',
  tooltip: 'Replace attachment',
  icon: ReplaceIcon(),
  disabled(ctx) {
    const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
    if (!block) return true;

    const { downloading = false, uploading = false } =
      block.resourceController.state$.value;
    return downloading || uploading;
  },
  run(ctx) {
    const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
    block?.replace().catch(console.error);
  },
} as const satisfies ToolbarAction;

const downloadAction = {
  id: 'd.download',
  tooltip: 'Download',
  icon: DownloadIcon(),
  run(ctx) {
    const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
    block?.download();
  },
  when(ctx) {
    const model = ctx.getCurrentModelByType(AttachmentBlockModel);
    if (!model) return false;
    // Current citation attachment block does not support download
    return model.props.style !== 'citation' && !model.props.footnoteIdentifier;
  },
} as const satisfies ToolbarAction;

const captionAction = {
  id: 'e.caption',
  tooltip: 'Caption',
  icon: CaptionIcon(),
  run(ctx) {
    const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
    block?.captionEditor?.show();

    ctx.track('OpenedCaptionEditor', {
      ...trackBaseProps,
      control: 'add caption',
    });
  },
} as const satisfies ToolbarAction;

const builtinToolbarConfig = {
  actions: [
    htmlInteraction,
    {
      id: 'a.rename',
      when: ctx => !isHtmlEmbed(ctx),
      content(ctx) {
        const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
        if (!block) return null;

        const abortController = new AbortController();
        abortController.signal.onabort = () => ctx.show();

        return html`
          <editor-icon-button
            aria-label="Rename"
            .tooltip="${'Rename'}"
            @click=${() => {
              ctx.hide();

              createLitPortal({
                template: RenameModal({
                  model: block.model,
                  editorHost: ctx.host,
                  abortController,
                }),
                computePosition: {
                  referenceElement: block,
                  placement: 'top-start',
                  middleware: [flip(), offset(4)],
                },
                abortController,
              });
            }}
          >
            ${EditIcon()}
          </editor-icon-button>
        `;
      },
    },
    attachmentViewDropdownMenu,
    { ...replaceAction, when: ctx => !isHtmlEmbed(ctx) },
    {
      ...replaceAction,
      id: 'd.html-replace',
      placement: ActionPlacement.More,
      label: 'Replace attachment',
      when: isHtmlEmbed,
    },
    downloadAction,
    captionAction,
    {
      placement: ActionPlacement.More,
      id: 'a.clipboard',
      actions: [
        {
          id: 'copy',
          label: 'Copy',
          icon: CopyIcon(),
          run(ctx) {
            // TODO(@fundon): unify `clone` method
            const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
            block?.copy();
          },
        },
        {
          id: 'duplicate',
          label: 'Duplicate',
          icon: DuplicateIcon(),
          run(ctx) {
            const model = ctx.getCurrentModelByType(AttachmentBlockModel);
            if (!model) return;

            // TODO(@fundon): unify `duplicate` method
            ctx.store.addSiblingBlocks(model, [
              {
                flavour: model.flavour,
                ...getBlockProps(model),
              },
            ]);
          },
        },
      ],
    },
    {
      placement: ActionPlacement.More,
      id: 'b.refresh',
      label: 'Reload',
      icon: ResetIcon(),
      run(ctx) {
        const block = ctx.getCurrentBlockByType(AttachmentBlockComponent);
        block?.reload();

        ctx.track('AttachmentReloadedEvent', {
          ...trackBaseProps,
          control: 'reload',
          type: block?.model.props.name.split('.').pop() ?? '',
        });
      },
    },
    {
      placement: ActionPlacement.More,
      id: 'c.delete',
      label: 'Delete',
      icon: DeleteIcon(),
      variant: 'destructive',
      run(ctx) {
        const model = ctx.getCurrentModel();
        if (!model) return;

        ctx.store.deleteBlock(model.id);

        // Clears
        ctx.select('note');
        ctx.reset();
      },
    },
  ],
} as const satisfies ToolbarModuleConfig;

const builtinSurfaceToolbarConfig = {
  actions: [
    htmlInteraction,
    { ...downloadAction, id: 'a.html-download', when: isHtmlEmbed },
    attachmentViewDropdownMenu,
    htmlScaleAction,
    {
      ...replaceAction,
      id: 'd.html-replace',
      placement: ActionPlacement.More,
      label: 'Replace attachment',
      when: isHtmlEmbed,
    },
    {
      id: 'c.style',
      when: ctx => !isHtmlEmbed(ctx),
      actions: [
        {
          id: 'horizontalThin',
          label: 'Horizontal style',
        },
        {
          id: 'cubeThick',
          label: 'Vertical style',
        },
      ],
      content(ctx) {
        const model = ctx.getCurrentModelByType(AttachmentBlockModel);
        if (!model) return null;

        const actions = this.actions.map(action => ({
          ...action,
          run: ({ store }) => {
            const style = action.id as EmbedCardStyle;
            const bounds = Bound.deserialize(model.xywh);
            bounds.w = EMBED_CARD_WIDTH[style];
            bounds.h = EMBED_CARD_HEIGHT[style];
            const xywh = bounds.serialize();

            store.updateBlock(model, { style, xywh });

            ctx.track('SelectedCardStyle', {
              ...trackBaseProps,
              page: 'whiteboard editor',
              control: 'select card style',
              type: style,
            });
          },
        })) satisfies ToolbarAction[];
        const style$ = model.props.style$;
        const onToggle = (e: CustomEvent<boolean>) => {
          e.stopPropagation();
          const opened = e.detail;
          if (!opened) return;

          ctx.track('OpenedCardStyleSelector', {
            ...trackBaseProps,
            page: 'whiteboard editor',
            control: 'switch card style',
          });
        };

        return html`${keyed(
          model,
          html`<affine-card-style-dropdown-menu
            @toggle=${onToggle}
            .actions=${actions}
            .context=${ctx}
            .styleSignal=${style$}
          ></affine-card-style-dropdown-menu>`
        )}`;
      },
    } satisfies ToolbarActionGroup<ToolbarAction>,
    {
      ...replaceAction,
      id: 'd.replace',
      when: ctx => !isHtmlEmbed(ctx),
    },
    {
      ...downloadAction,
      id: 'e.download',
      when: ctx => !isHtmlEmbed(ctx) && downloadAction.when(ctx),
    },
    {
      ...captionAction,
      id: 'f.caption',
    },
  ],
  when: ctx => ctx.getSurfaceModelsByType(AttachmentBlockModel).length === 1,
} as const satisfies ToolbarModuleConfig;

export const createBuiltinToolbarConfigExtension = (
  flavour: string
): ExtensionType[] => {
  const name = flavour.split(':').pop();

  return [
    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(flavour),
      config: builtinToolbarConfig,
    }),

    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(`affine:surface:${name}`),
      config: builtinSurfaceToolbarConfig,
    }),
  ];
};
