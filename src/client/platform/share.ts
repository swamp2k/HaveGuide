export interface SharePlatform {
  canShare(): boolean;
  share(title: string, text: string): Promise<void>;
}

export const browserShare: SharePlatform = {
  canShare: () => typeof navigator.share === 'function',
  async share(title, text) {
    if (!navigator.share) throw new Error('Deling understøttes ikke.');
    await navigator.share({ title, text });
  },
};
