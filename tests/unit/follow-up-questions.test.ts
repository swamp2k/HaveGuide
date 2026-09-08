import { describe, expect, it } from 'vitest';
import { filterRedundantFollowUpQuestions } from '../../src/server/providers/follow-up-questions';
import { EMPTY_PROFILE } from '../../src/shared/profile';
import type { AreaProfile } from '../../src/shared/types';

const COMPLETE: AreaProfile = {
  sun: 'full_sun',
  moisture: 'moist',
  soil: 'loam',
  drainage: 'normal',
  wind: 'sheltered',
  notes: '',
  goals: ['Lav vedligeholdelse'],
};

describe('filterRedundantFollowUpQuestions', () => {
  it('drops questions the filled-in profile already answers', () => {
    const questions = [
      'Hvor meget sol får bedet?',
      'Er jorden fugtig?',
      'Kender du jordtypen?',
      'Hvordan dræner jorden?',
      'Er området vindudsat?',
      'Hvad er formålet med bedet?',
      'Er de grønne rester bevidst efterladt?',
    ];

    expect(filterRedundantFollowUpQuestions(questions, COMPLETE)).toEqual([
      'Er de grønne rester bevidst efterladt?',
    ]);
  });

  it('keeps the sun question when sun is not filled in', () => {
    const profile: AreaProfile = { ...COMPLETE, sun: null };
    expect(filterRedundantFollowUpQuestions(['Hvor meget sol får bedet?'], profile)).toEqual([
      'Hvor meget sol får bedet?',
    ]);
  });

  it('keeps the soil question when the user answered "Ved ikke"', () => {
    const profile: AreaProfile = { ...COMPLETE, soil: 'unknown' };
    expect(filterRedundantFollowUpQuestions(['Kender du jordtypen?'], profile)).toEqual([
      'Kender du jordtypen?',
    ]);
  });

  it('keeps the goal question when no goals are set', () => {
    const profile: AreaProfile = { ...COMPLETE, goals: [] };
    expect(filterRedundantFollowUpQuestions(['Hvad vil du gerne have ud af området?'], profile)).toEqual([
      'Hvad vil du gerne have ud af området?',
    ]);
  });

  it('keeps contextual questions that merely mention a known condition', () => {
    const questions = [
      'Er der sæsoner hvor træets krone giver markant mere skygge?',
      'Er der perioder om vinteren, hvor træets krone ændrer lysforholdene markant?',
      'Ændrer fugten sig meget hen over året i det hjørne?',
      'Vil du helst have stauder eller buske i bedet?',
    ];

    expect(filterRedundantFollowUpQuestions(questions, COMPLETE)).toEqual(questions);
  });

  it('returns an empty list rather than inventing replacements', () => {
    expect(filterRedundantFollowUpQuestions(['Hvor meget sol får bedet?'], COMPLETE)).toEqual([]);
  });

  it('leaves every question alone when nothing in the profile is known', () => {
    const questions = ['Hvor meget sol får bedet?', 'Kender du jordtypen?'];
    expect(filterRedundantFollowUpQuestions(questions, EMPTY_PROFILE)).toEqual(questions);
  });

  it('treats "Ved ikke" enums as unknown across every condition', () => {
    const profile: AreaProfile = {
      ...EMPTY_PROFILE,
      soil: 'unknown',
      drainage: 'unknown',
      wind: 'unknown',
    };
    const questions = [
      'Hvilken jord er der i bedet?',
      'Hvordan er dræningen efter regn?',
      'Er området vindudsat?',
    ];

    expect(filterRedundantFollowUpQuestions(questions, profile)).toEqual(questions);
  });

  it('recognises other phrasings of the same redundant questions', () => {
    const questions = [
      'Hvor mange timers sol får bedet på en sommerdag?',
      'Står bedet i skygge det meste af dagen?',
      'Hvor hurtigt tørrer jorden efter regn?',
      'Er jorden sandet eller leret?',
      'Er der stående vand efter kraftig regn?',
      'Ligger området i læ?',
      'Hvad skal bedet bruges til?',
    ];

    expect(filterRedundantFollowUpQuestions(questions, COMPLETE)).toEqual([]);
  });
});
