/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import { restoreCommand as originalRestoreCommand } from '../ui/commands/restoreCommand.js';

/**
 * Factory function that creates a restore command with the required config dependency.
 * @param config The CLI configuration object.
 * @returns The restore command definition, or null if config is unavailable.
 */
export function restoreCommand(config: Config | null) {
  if (!config) {
    return null;
  }
  return originalRestoreCommand(config);
}
