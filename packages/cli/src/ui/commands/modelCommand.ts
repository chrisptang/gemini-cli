/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, MessageActionReturn } from './types.js';
import { CommandKind } from './types.js';

export const modelCommand: SlashCommand = {
  name: 'model',
  kind: CommandKind.BUILT_IN,
  description:
    'Change the model used for the current session. Usage: /model <model_name>',
  action: async (context, args): Promise<MessageActionReturn> => {
    const modelName = args.trim();

    if (!modelName) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing model name. Usage: /model <model_name>',
      };
    }

    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    // Update the model in the config
    config.setModel(modelName);

    return {
      type: 'message',
      messageType: 'info',
      content: `Model changed to: ${modelName}`,
    };
  },
};
