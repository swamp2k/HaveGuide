import type { AreaProfile } from './types';

export const EMPTY_PROFILE: AreaProfile = {
  sun: null,
  moisture: null,
  soil: null,
  drainage: null,
  wind: null,
  notes: '',
  goals: [],
};

export function isProfileComplete(profile: AreaProfile): boolean {
  return Boolean(profile.sun && profile.moisture && profile.soil && profile.drainage);
}
