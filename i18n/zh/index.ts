import type { Translation } from '../i18n-types';

const zh: Translation = {
  settings: {
    stopOtherPlayers: {
      title: '播放时停止其他播放器',
      description: '播放新音频文件时停止其他播放器',
    },
    waveformType: {
      title: '波形类型',
      description: '选择音频波形的显示样式',
      options: {
        bars: '柱形',
        envelope: '包络',
        line: '单线条',
        mirror: '镜像',
        wave: '波浪'
      }
    },
    samplePoints: {
      title: '波形采样点数量',
      description: '设置波形图的采样点数量。数值越大，波形细节越丰富，但性能消耗也越大。',
      options: {
        '50': '50 (最低)',
        '100': '100 (低)',
        '200': '200 (默认)',
        '500': '500 (中)',
        '1000': '1000 (高)',
        '2000': '2000 (很高)',
        '5000': '5000 (极高)'
      }
    },
  },
};

export default zh;
