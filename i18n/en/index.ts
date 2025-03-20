import type { BaseTranslation } from '../i18n-types';

const en: BaseTranslation = {
  settings: {
    stopOtherPlayers: {
      title: 'Stop other players when playing',
      description: 'Stop other players when playing a new audio file',
    },
    waveformType: {
      title: 'Waveform Type',
      description: 'Choose the display style of the audio waveform',
      options: {
        bars: 'Bars',
        envelope: 'Envelope',
        line: 'Line',
        mirror: 'Mirror',
        wave: 'Wave'
      }
    },
    samplePoints: {
      title: 'Sample points',
      description: 'Set the number of sample points for the waveform. The higher the number, the more detailed the waveform, but the performance consumption is also higher.',
      options: {
        '50': '50 (Lowest)',
        '100': '100 (Low)',
        '200': '200 (Default)',
        '500': '500 (Medium)',
        '1000': '1000 (High)',
        '2000': '2000 (Very High)',
        '5000': '5000 (Extreme)'
      }
    },
  },
};
export default en;
