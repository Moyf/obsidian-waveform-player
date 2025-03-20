import type { EditorState, Extension } from '@codemirror/state';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { ComponentType, ReactNode } from 'react';
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import WaveformPlayer, { AudioPlayerContextValue } from '@waveform-audio/player';
import { Plugin, TFile, PluginSettingTab, Setting, App } from 'obsidian';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import L from './L';

const PLAYER_CLASS = 'waveform-player-widget';
const AUDIO_LINK_PATTERN = '!\\[([^\\]]*)\\]\\(([^)]+\\.(?:mp3|wav|ogg|m4a|webm))\\)|!\\[\\[([^\\]]+\\.(?:mp3|wav|ogg|m4a|webm))\\]\\]';

// 波形类型枚举
type WaveformType = 'bars' | 'envelope' | 'line' | 'mirror' | 'wave';

// 插件设置接口
interface WaveformPlayerSettings {
  stopOthersOnPlay: boolean;
  waveformType: WaveformType;
  samplePoints: number; // 采样点数量
}

// 默认设置
const DEFAULT_SETTINGS: WaveformPlayerSettings = {
  stopOthersOnPlay: true,
  waveformType: 'mirror',
  samplePoints: 200, // 默认采样点数量
};

// 全局音频播放器注册表
let audioPlayerContexts: AudioPlayerContextValue[] = [];

// 阅读视图播放器信息存储
interface ReadingViewPlayerInfo {
  root: ReturnType<typeof createRoot>;
  container: HTMLElement;
  playerDiv: HTMLElement;
  audioUrl: string;
  title: string;
}

// 播放器属性接口，用于统一创建播放器组件
interface PlayerProps {
  src: string;
  title: string;
  plugin: WaveformPlayerPlugin;
  id?: string;
}

// 创建播放器React元素的统一函数
function createPlayerElement({ src, title, plugin, id }: PlayerProps): ReactNode {
  return createElement(WaveformPlayer as ComponentType<any>, {
    className: 'wa-obsidian-player',
    key: id,
    samplePoints: plugin.settings.samplePoints, // 使用设置中的采样点数量
    src,
    showDownloadButton: false,
    onPlay: (ctx: AudioPlayerContextValue) => {
      if (plugin.settings.stopOthersOnPlay) {
        audioPlayerContexts.forEach(player => {
          if (player.instanceId !== ctx.instanceId) {
            player.pause();
          }
        });
      }
      audioPlayerContexts.push(ctx);
    },
    onPause: (ctx: AudioPlayerContextValue) => {
      audioPlayerContexts = audioPlayerContexts.filter(player => player.instanceId !== ctx.instanceId);
    },
    onEnded: (ctx: AudioPlayerContextValue) => {
      // 音频结束时从注册表中移除
      audioPlayerContexts = audioPlayerContexts.filter(player => player.instanceId !== ctx.instanceId);
    },
    styles: {
      controls: {
        width: '156px',
        padding: 0,
      },
      header: {
        padding: 0,
        paddingBottom: 8,
      },
      title: {
        fontSize: '14px',
        margin: 0,
      },
      waveform: {
        height: '100px',
      },
    },
    title,
    type: plugin.settings.waveformType,
  });
}

class AudioPlayerWidget extends WidgetType {
  private static counter = 0;
  private container: HTMLElement | null = null;
  private readonly id: string;
  private mounted = false;
  private playerDiv: HTMLElement | null = null;
  private root: null | ReturnType<typeof createRoot> = null;
  // 记录创建时的设置版本，用于检测设置是否变化
  private settingsVersion: number;

  // 存储所有实例的静态集合
  private static instances: Set<AudioPlayerWidget> = new Set();

  // 静态触发器，用于手动触发重新渲染所有播放器
  public static updateTrigger = StateEffect.define<void>();

  constructor(
    private readonly src: string,
    private readonly title: string,
    private readonly plugin: WaveformPlayerPlugin,
  ) {
    super();
    this.id = `audio-player-${AudioPlayerWidget.counter++}`;
    // 记录当前的设置版本
    this.settingsVersion = this.plugin.settingsVersion;
    // 将实例添加到集合中
    AudioPlayerWidget.instances.add(this);
  }

  destroy() {
    // 从集合中移除实例
    AudioPlayerWidget.instances.delete(this);
    this.unmount();
    this.container = null;
    this.playerDiv = null;
  }

  // 静态方法：重新渲染所有播放器实例
  static refreshAllPlayers(plugin: WaveformPlayerPlugin): void {
    // 触发编辑器强制更新
    plugin.triggerEditorRefresh();
  }

  // 重新挂载播放器
  remount(): void {
    if (this.playerDiv && this.container) {
      this.unmount();
      this.mount();
    }
  }

  // 当比较两个播放器小部件是否相同时，同时考虑设置版本
  eq(other: AudioPlayerWidget): boolean {
    return (
      other instanceof AudioPlayerWidget &&
      this.src === other.src &&
      this.title === other.title &&
      this.settingsVersion === other.settingsVersion // 比较设置版本
    );
  }

  toDOM() {
    if (this.container) {
      this.unmount();
    }

    const container = document.createElement('div');
    container.className = `${PLAYER_CLASS}-container`;
    container.dataset.playerId = this.id;

    const playerDiv = document.createElement('div');
    playerDiv.className = PLAYER_CLASS;
    container.appendChild(playerDiv);

    this.container = container;
    this.playerDiv = playerDiv;

    // 使用 requestIdleCallback 延迟挂载，优化性能
    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => this.mount());
    }
    else {
      setTimeout(() => this.mount(), 0);
    }

    return container;
  }

  private mount() {
    if (!this.playerDiv || !this.container || this.mounted) {
      return;
    }
    const audioFile = this.plugin.getAudioFile(this.src);
    if (!audioFile) {
      console.warn('[AudioPlayerWidget] Audio file not found:', this.src);
      return;
    }

    const audioUrl = this.plugin.app.vault.getResourcePath(audioFile);
    const decodedUrl = decodeURIComponent(audioUrl);

    try {
      this.root = createRoot(this.playerDiv);
      this.root.render(
        createPlayerElement({
          src: decodedUrl,
          title: this.title || audioFile.basename,
          plugin: this.plugin,
          id: this.id
        })
      );
      this.mounted = true;
    }
    catch (error) {
      console.error('[AudioPlayerWidget] Failed to mount player:', error);
    }
  }

  private unmount() {
    if (this.root) {
      try {
        this.root.unmount();
      }
      catch (error) {
        console.error('[AudioPlayerWidget] Failed to unmount player:', error);
      }
      this.root = null;
    }
    if (this.playerDiv) {
      this.playerDiv.innerHTML = '';
    }
    this.mounted = false;
  }
}

export default class WaveformPlayerPlugin extends Plugin {
  settings: WaveformPlayerSettings = DEFAULT_SETTINGS;
  // 设置版本号，每次设置变更时递增
  settingsVersion: number = 0;
  // 存储阅读视图中渲染的播放器
  private readingViewPlayers: ReadingViewPlayerInfo[] = [];
  // 编辑器视图
  private editorViews: Set<EditorView> = new Set();

  // 触发编辑器视图刷新
  triggerEditorRefresh(): void {
    this.editorViews.forEach(view => {
      view.dispatch({
        effects: AudioPlayerWidget.updateTrigger.of(undefined)
      });
    });
  }

  // 更新所有播放器
  refreshAllPlayers(): void {
    // 增加设置版本号
    this.settingsVersion++;

    // 更新编辑器视图中的播放器
    AudioPlayerWidget.refreshAllPlayers(this);

    // 更新阅读视图中的播放器
    this.refreshReadingViewPlayers();

    // 通知用户刷新完成
    this.app.workspace.trigger('waveform-player:refresh-complete');
  }

  // 刷新阅读视图播放器
  private refreshReadingViewPlayers(): void {
    this.readingViewPlayers.forEach(playerInfo => {
      try {
        // 卸载并重新渲染播放器
        playerInfo.root.unmount();
        const root = createRoot(playerInfo.playerDiv);

        root.render(
          createPlayerElement({
            src: playerInfo.audioUrl,
            title: playerInfo.title,
            plugin: this
          })
        );

        // 更新播放器根节点引用
        playerInfo.root = root;
      } catch (error) {
        console.error('[WaveformPlayerPlugin] Failed to refresh reading view player:', error);
      }
    });
  }

  createEditorExtension(): Extension {
    const updateAudioPlayers = StateEffect.define<void>();
    const plugin = this;

    const audioPlayerField = StateField.define<DecorationSet>({
      create: (state) => {
        return this.buildDecorations(state);
      },
      provide: field => EditorView.decorations.from(field),
      update: (decorations, tr) => {
        if (!tr.docChanged &&
          !tr.effects.some(e => e.is(updateAudioPlayers)) &&
          !tr.effects.some(e => e.is(AudioPlayerWidget.updateTrigger))) {
          return decorations;
        }

        const changes = tr.changes;
        let needsUpdate = false;

        if (tr.docChanged) {
          const regex = new RegExp(AUDIO_LINK_PATTERN);
          /* @ts-ignore */
          changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
            const insertedText = inserted.toString();
            const hasAudioLink = regex.test(insertedText);
            if (hasAudioLink) {
              needsUpdate = true;
            }
          });
        }

        // 如果是设置更新触发器，强制更新
        if (tr.effects.some(e => e.is(AudioPlayerWidget.updateTrigger))) {
          needsUpdate = true;
        }

        if (!needsUpdate && !tr.effects.some(e => e.is(updateAudioPlayers))) {
          return decorations;
        }

        return this.buildDecorations(tr.state);
      },
    });

    const viewportPlugin = ViewPlugin.fromClass(class {
      private updateScheduled = false;
      private timeout: number | null = null;

      constructor(private readonly view: EditorView) {
        this.scheduleUpdate();
        // 注册编辑器视图
        plugin.editorViews.add(view);
      }

      destroy() {
        if (this.timeout) {
          clearTimeout(this.timeout);
        }
        // 移除编辑器视图
        plugin.editorViews.delete(this.view);
      }

      update(update: ViewUpdate) {
        if (update.viewportChanged) {
          this.scheduleUpdate();
        }
      }

      private scheduleUpdate() {
        if (this.updateScheduled) {
          return;
        }
        this.updateScheduled = true;

        if (this.timeout) {
          clearTimeout(this.timeout);
        }

        this.timeout = window.setTimeout(() => {
          this.updateScheduled = false;
          this.view.dispatch({
            effects: updateAudioPlayers.of(undefined),
          });
        }, 200);
      }
    });

    return [audioPlayerField, viewportPlugin];
  }

  getAudioFile(src: string): null | TFile {
    const audioFile = this.app.metadataCache.getFirstLinkpathDest(src, '');
    return audioFile instanceof TFile ? audioFile : null;
  }

  async onload() {
    // 加载设置
    await this.loadSettings();

    // 添加设置选项卡
    this.addSettingTab(new WaveformPlayerSettingTab(this.app, this));

    // 注册编辑器扩展
    this.registerEditorExtension(this.createEditorExtension());

    // 注册 Markdown 后处理器（用于阅读视图）
    this.registerMarkdownPostProcessor((element) => {
      const audioElements = element.querySelectorAll('.internal-embed');

      audioElements.forEach((div) => {
        const src = div.getAttribute('src');
        if (!src || !/\.(?:mp3|wav|ogg|m4a|webm)$/i.test(src)) {
          return;
        }

        const audioFile = this.getAudioFile(src);
        if (!audioFile) {
          return;
        }

        const audioUrl = this.app.vault.getResourcePath(audioFile);
        const decodedUrl = decodeURIComponent(audioUrl);

        const container = document.createElement('div');
        container.className = `${PLAYER_CLASS}-container`;

        const playerDiv = document.createElement('div');
        playerDiv.className = PLAYER_CLASS;
        container.appendChild(playerDiv);

        // 在原有元素后面插入播放器
        div.parentNode?.insertBefore(container, div.nextSibling);

        const root = createRoot(playerDiv);

        // 创建播放器信息并存储
        const playerInfo: ReadingViewPlayerInfo = {
          root,
          container,
          playerDiv,
          audioUrl: decodedUrl,
          title: audioFile.basename,
        };

        // 将播放器信息添加到列表中
        this.readingViewPlayers.push(playerInfo);

        // 当组件卸载时，从列表中移除
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of Array.from(mutation.removedNodes)) {
              if (node.contains(container)) {
                this.readingViewPlayers = this.readingViewPlayers.filter(p => p !== playerInfo);
                observer.disconnect();
                return;
              }
            }
          }
        });

        // 监视 DOM 变化
        if (div.parentNode) {
          observer.observe(div.parentNode, { childList: true, subtree: true });
        }

        root.render(
          createPlayerElement({
            src: decodedUrl,
            title: audioFile.basename,
            plugin: this
          })
        );
      });
    });
  }

  onunload() {
    // 清理所有播放器
    this.readingViewPlayers.forEach(playerInfo => {
      try {
        playerInfo.root.unmount();
      } catch (error) {
        console.error('[WaveformPlayerPlugin] Failed to unmount reading view player:', error);
      }
    });
    this.readingViewPlayers = [];
    this.editorViews.clear();

    audioPlayerContexts.forEach(ctx => ctx.stop());
    audioPlayerContexts = [];
  }

  // 加载设置
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  // 保存设置
  async saveSettings() {
    await this.saveData(this.settings);
  }

  private buildDecorations(state: EditorState): DecorationSet {
    const widgets: any[] = [];
    const doc = state.doc;

    // 遍历所有行，注意 CodeMirror 6 中行号从 1 开始
    for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
      const line = doc.line(lineNo);
      const lineText = line.text;

      // 每次创建新的正则表达式实例
      const regex = new RegExp(AUDIO_LINK_PATTERN, 'gi');

      Array.from(lineText.matchAll(regex)).forEach((match) => {
        const [_, title, mdSrc, obsidianSrc] = match;
        // 如果是 Obsidian 格式的链接，使用 obsidianSrc 作为源和标题
        const src = obsidianSrc || mdSrc;
        const effectiveTitle = obsidianSrc ? obsidianSrc.split('/').pop()?.replace(/\.[^.]+$/, '') || '' : (title || '');

        if (!src) {
          return;
        }

        const matchStart = line.from + match.index!;
        const matchEnd = matchStart + match[0].length;

        // 添加播放器装饰器，直接在链接后面插入
        widgets.push(
          Decoration.widget({
            block: true, // 添加 block 属性
            persistent: true,
            side: 1, // 在匹配文本后面插入
            widget: new AudioPlayerWidget(src, effectiveTitle, this),
          }).range(matchEnd),
        );
      });
    }

    return Decoration.set(widgets, true);
  }
}

// 设置选项卡类
class WaveformPlayerSettingTab extends PluginSettingTab {
  plugin: WaveformPlayerPlugin;

  constructor(app: App, plugin: WaveformPlayerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName(L.settings.stopOtherPlayers.title())
      .setDesc(L.settings.stopOtherPlayers.description())
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.stopOthersOnPlay)
        .onChange(async (value) => {
          this.plugin.settings.stopOthersOnPlay = value;
          await this.plugin.saveSettings();
          // 设置变化时刷新所有播放器
          this.plugin.refreshAllPlayers();
        }));

    new Setting(containerEl)
      .setName(L.settings.waveformType.title())
      .setDesc(L.settings.waveformType.description())
      .addDropdown(dropdown => dropdown
        .addOptions({
          'bars': L.settings.waveformType.options.bars(),
          'envelope': L.settings.waveformType.options.envelope(),
          'line': L.settings.waveformType.options.line(),
          'mirror': L.settings.waveformType.options.mirror(),
          'wave': L.settings.waveformType.options.wave()
        })
        .setValue(this.plugin.settings.waveformType)
        .onChange(async (value: string) => {
          this.plugin.settings.waveformType = value as WaveformType;
          await this.plugin.saveSettings();
          // 设置变化时刷新所有播放器
          this.plugin.refreshAllPlayers();
        }));

    new Setting(containerEl)
      .setName(L.settings.samplePoints.title())
      .setDesc(L.settings.samplePoints.description())
      .addDropdown(dropdown => dropdown
        .addOptions({
          '50': L.settings.samplePoints.options[50](),
          '100': L.settings.samplePoints.options[100](),
          '200': L.settings.samplePoints.options[200](),
          '500': L.settings.samplePoints.options[500](),
          '1000': L.settings.samplePoints.options[1000](),
          '2000': L.settings.samplePoints.options[2000](),
          '5000': L.settings.samplePoints.options[5000]()
        })
        .setValue(this.plugin.settings.samplePoints.toString())
        .onChange(async (value: string) => {
          this.plugin.settings.samplePoints = parseInt(value, 10);
          await this.plugin.saveSettings();
          // 设置变化时刷新所有播放器
          this.plugin.refreshAllPlayers();
        }));
  }
}
