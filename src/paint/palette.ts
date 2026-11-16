// The palette: ramps from shade to light, mixed once when the world is built.
// Shade leans to violet and night blue, light to gold, like the Void Tarot deck at dusk.
import { ramps, hex } from './util';

export const RAMP = ramps({
  grass: ['#151634', '#212748', '#2a3c52', '#345547', '#4f6c3f', '#86883c', '#c4a04a', '#efc865'],
  meadow: ['#181a3a', '#24304f', '#2f4a50', '#456b46', '#6f8240', '#a89a4a', '#e2bc62'],
  path: ['#231c3c', '#3a2e52', '#5d4762', '#8a6268', '#b8826c', '#d9a77a', '#f4cf94'],
  paving: ['#1c1834', '#2c2648', '#463c5e', '#6a5870', '#97787a', '#c49a86', '#e9c39a'],
  foliage: ['#0f1430', '#18233f', '#203646', '#2b4c45', '#40683f', '#6f823a', '#b0983e', '#e9c25e'],
  autumn: ['#1a1230', '#2e1c40', '#4c2a44', '#7a3c3e', '#a85a36', '#d08a3a', '#f2bf5a'],
  fir: ['#0b1026', '#121c34', '#18293c', '#20393f', '#2f5040', '#557042', '#9a9248'],
  bark: ['#120d20', '#21172c', '#352436', '#523440', '#7a4c46', '#a8704e'],
  castle: ['#120e28', '#1d1638', '#2a2050', '#3a2c66', '#54407c', '#7c5c8e', '#b88a98', '#ebbd9c'],
  slate: ['#0d0a22', '#171334', '#221c48', '#30285c', '#463a74', '#6c5486', '#a87c92'],
  roof: ['#1e0c26', '#3a1430', '#5e1c34', '#882a36', '#b04434', '#d8703e', '#f6a660'],
  plaster: ['#221d3a', '#3a3254', '#5e526c', '#8a7880', '#b8a08e', '#dcc29e', '#f7e2b6'],
  wood: ['#140e1e', '#251828', '#3c2630', '#5a3a36', '#7e5440', '#a8744e'],
  stone: ['#141428', '#202038', '#30304a', '#46445e', '#625c72', '#8a7c84', '#b8a092', '#e2c4a2'],
  water: ['#0c1130', '#141d45', '#20306a', '#34488a', '#5a5e9e', '#9a78a6', '#e0a49c', '#ffd8a0'],
  mountain: ['#1c1840', '#262050', '#322a62', '#433874', '#5a4a86', '#7a6296', '#a882a2', '#dcaab0'],
  cloth: ['#1a0c22', '#36102c', '#5c1834', '#86243a', '#b04040', '#d8704e'],
  robeViolet: ['#120c26', '#20163e', '#33225a', '#4c3478', '#6e4c96', '#9a74b0'],
  robeTeal: ['#0a1622', '#102532', '#163a44', '#205456', '#357266', '#5a9478'],
  gold: ['#3a2410', '#6a4418', '#a06a20', '#d09a32', '#f2c650', '#fff0a0'],
  skin: ['#3a2430', '#5c3a3e', '#8a5a4e', '#b8806a', '#dcab8a', '#f4d0aa'],
  shade: ['#05040c', '#0b0918', '#141026', '#1e1838', '#2c2250', '#3e3068'],
});

export const LAMP = hex('#ffac48');
export const LAMP_HOT = hex('#ffe2a0');
export const MIST_WARM = '#c98a86';
export const MIST_COOL = '#3c3870';
