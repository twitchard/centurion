import { type UpdateResult, assertNever } from '../core/update'
import type { CenturionMatchCmd } from '../features/centurion-match/types'
import { initChatLabModel } from '../features/chat-lab/model'
import { updateChatLab } from '../features/chat-lab/update'
import { initSinglePlayerModel } from '../features/single-player-match/model'
import { updateSinglePlayer } from '../features/single-player-match/update'
import { initSuperpositionLabModel } from '../features/superposition-lab/model'
import { updateSuperpositionLab } from '../features/superposition-lab/update'
import type { AppCmd, AppMsg, AppState } from './model'

function mapChatCmds(
  commands: readonly ReturnType<typeof updateChatLab>[1][number][],
): AppCmd[] {
  return commands.map((cmd) => ({ tag: 'chat-lab', cmd }))
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
    case 'navigate': {
      const path = msg.path
      if (path === '/labs') {
        return [{ tag: 'labs-menu' }, cleanupCommandsFor(state)]
      }
      const nextState: AppState = { tag: 'centurion-match' }
      const cleanup = cleanupCommandsFor(state)
      if (cleanup.length > 0) {
        return [
          nextState,
          [...cleanup, { tag: 'centurion-match', cmd: { tag: 'mount' } }],
        ]
      }
      return routeToCenturion(nextState)
    }

    case 'open-superposition-lab':
      return [
        { tag: 'superposition-lab', model: initSuperpositionLabModel() },
        cleanupCommandsFor(state),
      ]

    case 'open-chat-lab':
      return [
        { tag: 'chat-lab', model: initChatLabModel() },
        cleanupCommandsFor(state),
      ]

    case 'open-centurion-match': {
      const nextState: AppState = { tag: 'centurion-match' }
      const cleanup = cleanupCommandsFor(state)
      if (cleanup.length > 0) {
        return [
          nextState,
          [...cleanup, { tag: 'centurion-match', cmd: { tag: 'mount' } }],
        ]
      }
      return routeToCenturion(nextState)
    }

    case 'back-to-labs-menu':
      return [{ tag: 'labs-menu' }, cleanupCommandsFor(state)]

    case 'superposition-lab-msg': {
      if (state.tag !== 'superposition-lab') {
        return [state, []]
      }
      const [nextModel] = updateSuperpositionLab(state.model, msg.msg)
      return [{ tag: 'superposition-lab', model: nextModel }, []]
    }

    case 'chat-lab-msg': {
      if (state.tag !== 'chat-lab') {
        return [state, []]
      }
      const [nextModel, commands] = updateChatLab(state.model, msg.msg)
      return [{ tag: 'chat-lab', model: nextModel }, mapChatCmds(commands)]
    }

    case 'open-single-player-match': {
      const nextState: AppState = {
        tag: 'single-player-match',
        model: initSinglePlayerModel(),
      }
      return [nextState, cleanupCommandsFor(state)]
    }

    case 'single-player-msg': {
      if (state.tag !== 'single-player-match') {
        return [state, []]
      }
      const [nextModel] = updateSinglePlayer(state.model, msg.msg)
      return [{ tag: 'single-player-match', model: nextModel }, []]
    }

    default:
      return assertNever(msg)
  }
}
