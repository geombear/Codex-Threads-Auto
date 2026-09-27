import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionEnv} from '../server/subscription.js';
test('구독 CLI 환경에 API 키와 앱 비밀값을 전달하지 않는다',()=>{process.env.OPENAI_API_KEY='test-secret';process.env.CODEX_API_KEY='test-secret';process.env.GEMINI_API_KEY='test-secret';process.env.DATABASE_URL='test-secret';const env=subscriptionEnv();for(const name of ['OPENAI_API_KEY','CODEX_API_KEY','GEMINI_API_KEY','DATABASE_URL'])assert.equal(env[name],undefined);delete process.env.OPENAI_API_KEY;delete process.env.CODEX_API_KEY;delete process.env.GEMINI_API_KEY;delete process.env.DATABASE_URL;});
