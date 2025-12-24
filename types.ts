export type AppMode = 'TREE' | 'SCATTER' | 'FOCUS';

export interface ParticleConfig {
  count: number;
  dustCount: number;
  treeHeight: number;
  treeRadius: number;
}

export interface AppColors {
  bg: number;
  champagneGold: number;
  deepGreen: number;
  accentRed: number;
}

export interface UploadedImage {
  id: string;
  url: string;
}
