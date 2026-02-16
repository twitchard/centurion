import type { UpdateResult } from '../core/update'
import { initChatLabModel } from '../features/chat-lab/model'
import { updateChatLab } from '../features/chat-lab/update'
import {
  initCenturionMatchModel,
  type CenturionMatchCmd,
} from '../features/centurion-match/types'
import { initSuperpositionLabModel } from '../features/superposition-lab/model'
import { updateSuperpositionLab } from '../features/superposition-lab/update'
import type { AppCmd, AppMsg, AppState } from './model'

function mapChatCmds(commands: readonly ReturnType<typeof updateChatLab>[1][number][]): AppCmd[] {
  return commands.map((cmd) => ({ tag: 'chat-lab', cmd }))
}

function mapSuperpositionCmds(
  commands: readonly ReturnType<typeof updateSuperpositionLab>[1][number][],
): AppCmd[] {
  return commands.map((cmd) => ({ tag: 'superposition-lab', cmd }))
}

function cleanupCommandsFor(state: AppState): readonly AppCmd[] {
  if (state.tag === 'chat-lab') {
    return [{ tag: 'chat-lab', cmd: { tag: 'transport-disconnect' } }]
  }
  if (state.tag === 'centurion-match') {
    return [{ tag: 'centurion-match', cmd: { tag: 'unmount' } }]
  }
  return []
}

function routeToCenturion(nextState: AppState): UpdateResult<AppState, AppCmd> {
  const mount: CenturionMatchCmd = { tag: 'mount' }
  return [nextState, [{ tag: 'centurion-match', cmd: mount }]]
}

export function updateApp(
  state: AppState,
  msg: AppMsg,
): UpdateResult<AppState, AppCmd> {
  switch (msg.tag) {
    case 'open-superposition-lab':
      return [
        { tag: 'superposition-lab', model: initSuperpositionLabModel() },
        cleanupCommandsFor(state),
      ]

    case 'open-chat-lab':
      return [{ tag: 'chat-lab', model: initChatLabModel() }, cleanupCommandsFor(state)]

    case 'open-centurion-match': {
      const nextState: AppState = {
        tag: 'centurion-match',
        model: initCenturionMatchModel(),
      }
      const cleanup = cleanupCommandsFor(state)
      if (cleanup.length > 0) {
        return [
          nextState,
          [...cleanup, { tag: 'centurion-match', cmd: { tag: 'mount' } }],
        ]
      }
      return routeToCenturion(nextState)
    }

    case 'back-to-menu':
      return [{ tag: 'menu' }, cleanupCommandsFor(state)]

    case 'superposition-lab-msg': {
      if (state.tag !== 'superposition-lab') {
        return [state, []]
      }
      const [nextModel, commands] = updateSuperpositionLab(state.model, msg.msg)
      return [{ tag: 'superposition-lab', model: nextModel }, mapSuperpositionCmds(commands)]
    }

    case 'chat-lab-msg': {
      if (state.tag !== 'chat-lab') {
        return [state, []]
      }
      const [nextModel, commands] = updateChatLab(state.model, msg.msg)
      return [{ tag: 'chat-lab', model: nextModel }, mapChatCmds(commands)]
    }

    default: {
      const exhaustive: never = msg
      return [state, []]
    }
  }
}
