'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const botkit = require('../..');

function createController(t) {
    const controller = botkit.slackbot({
        clientSigningSecret: 'local-test-signing-secret',
        retry: 10,
        log: false
    });
    t.after(() => controller.shutdown());
    return controller;
}

test('the package loads without BotBuilder or skills-validator installed', () => {
    assert.equal(typeof botkit.slackbot, 'function');
    assert.equal(botkit.botframeworkbot, undefined);
    for (const name of ['botbuilder', 'skills-validator']) {
        assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' });
    }
});

test('Slack OAuth, webhook and worker APIs remain available', (t) => {
    const controller = createController(t);
    controller.configureSlackApp({
        clientId: 'local-test-client',
        clientSecret: 'local-test-secret',
        clientSigningSecret: 'local-test-signing-secret',
        scopes: ['bot']
    });

    const app = express();
    controller.createWebhookEndpoints(app);
    controller.createOauthEndpoints(app, () => {});

    const bot = controller.spawn({ token: 'local-test-token' });
    assert.equal(bot.type, 'slack');
    for (const method of ['startRTM', 'reply', 'replyInteractive']) {
        assert.equal(typeof bot[method], 'function', method);
    }
    assert.equal(typeof bot.api.chat.postMessage, 'function');
    assert.equal(controller.config.clientId, 'local-test-client');
    assert.deepEqual(controller.config.scopes, ['bot']);
});

test('Slack commands and interactive events reach registered handlers', async (t) => {
    const controller = createController(t);
    const bot = controller.spawn({ token: 'local-test-token' });

    for (const event of ['slash_command', 'block_actions', 'dialog_submission', 'link_shared']) {
        const message = { type: event, user: 'U_LOCAL', team_id: 'T_LOCAL' };
        await new Promise((resolve, reject) => {
            controller.on(event, (receivedBot, receivedMessage) => {
                try {
                    assert.equal(receivedBot, bot);
                    assert.equal(receivedMessage, message);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
            controller.trigger(event, [bot, message]);
        });
    }
});
