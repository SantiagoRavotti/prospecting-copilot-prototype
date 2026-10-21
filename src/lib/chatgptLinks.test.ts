import { beforeEach, describe, expect, it } from 'vitest';
import { getState, replaceState } from './store';
import { createCampaign } from './campaignStore';
import { buildDesktopInitialState, CAMPAIGN_BL_ID } from '../data/campaigns';
import {
  clearConversationLink,
  conversationIdFromUrl,
  currentScope,
  linkFor,
  saveConversationLink,
  setActiveCampaign,
} from './chatgptLinks';

const URL_A = 'https://chatgpt.com/c/0f8e2a6b-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const URL_B = 'https://chatgpt.com/g/g-p-abc/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

beforeEach(() => replaceState(buildDesktopInitialState()));

describe('ChatGPT conversation reference', () => {
  it('parses conversation ids from plain and project URLs; rejects the home page', () => {
    expect(conversationIdFromUrl(URL_A)).toBe('0f8e2a6b-1c2d-4e5f-8a9b-0c1d2e3f4a5b');
    expect(conversationIdFromUrl(URL_B)).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(conversationIdFromUrl('https://chatgpt.com/')).toBeNull();
    expect(saveConversationLink('workspace:x', 'https://chatgpt.com/', 'user_choice')).toBeNull();
  });

  it('campaign scope has its own conversation and falls back to the workspace one', () => {
    const ws = currentScope(getState());
    expect(ws.key).toBe(`workspace:${CAMPAIGN_BL_ID}`);
    saveConversationLink(ws.key, URL_A, 'user_choice');

    const c = createCampaign(CAMPAIGN_BL_ID, { name: 'E-commerce España' });
    setActiveCampaign(c.id);
    const cs = currentScope(getState());
    expect(cs.key).toBe(`campaign:${c.id}`);
    expect(linkFor(getState(), cs)?.url).toBe(URL_A); // inherited from the workspace

    saveConversationLink(cs.key, URL_B, 'first_directive');
    expect(linkFor(getState(), cs)?.conversationId).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    clearConversationLink(cs.key);
    expect(linkFor(getState(), cs)?.url).toBe(URL_A);
  });

  it('the reference survives a restart (serialized state)', () => {
    const c = createCampaign(CAMPAIGN_BL_ID, { name: 'X' });
    setActiveCampaign(c.id);
    saveConversationLink(`campaign:${c.id}`, URL_A, 'first_directive');
    replaceState(JSON.parse(JSON.stringify(getState())));
    expect(linkFor(getState(), currentScope(getState()))?.source).toBe('first_directive');
  });
});
