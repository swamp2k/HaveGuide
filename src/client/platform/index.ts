import { browserLocation } from './location';
import { browserPreferenceStorage } from './storage';
import { browserShare } from './share';

export const platform = {
  location: browserLocation,
  preferences: browserPreferenceStorage,
  share: browserShare,
};
