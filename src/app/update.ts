import { type UpdateResult, assertNever } from '../core/update'
import { initCenturionModel } from '../features/centurion-match/model'
import { updateCenturion } from '../features/centurion-match/update'
import { initCommandLabModel } from '../features/command-lab/model'
import { updateCommandLab } from '../features/command-lab/update'
import { initSuperpositionLabModel } from '../features/superposition-lab/model'
import { updateSuperpositionLab } from '../features/superposition-lab/update'
import type { AppCmd, AppMsg, AppState } from './model'

function cleanupCommandsFor(state: AppState): readonly AppCmd[] {
  if (state.tag === 'centurion-match') {
    return [{ tag: 'centurion', cmd: { tag: 'room-leave' } }]
  }
  return []
}

export function updateApp(
  state: AppState,
  msg: AppMsg,
): UpdateResult<AppState, AppCmd> {
  switch (msg.tag) {
    case 'navigate': {
      if (msg.route === 'labs') {
        if (state.tag === 'labs-menu') {
          return [state, []]
        }
        return [{ tag: 'labs-menu' }, cleanupCommandsFor(state)]
      }
      if (state.tag === 'centurion-match') {
        return [state, []]
      }
      return [
        { tag: 'centurion-match', model: initCenturionModel() },
        cleanupCommandsFor(state),
      ]
    }

    case 'open-superposition-lab':
      return [
        { tag: 'superposition-lab', model: initSuperpositionLabModel() },
        cleanupCommandsFor(state),
      ]

    case 'open-command-lab':
      return [
        { tag: 'command-lab', model: initCommandLabModel() },
        cleanupCommandsFor(state),
      ]

    case 'open-centurion-match':
      if (state.tag === 'centurion-match') {
        return [state, []]
      }
      return [
        { tag: 'centurion-match', model: initCenturionModel() },
        cleanupCommandsFor(state),
      ]

    case 'back-to-labs-menu':
      return [{ tag: 'labs-menu' }, cleanupCommandsFor(state)]

    case 'superposition-lab-msg': {
      if (state.tag !== 'superposition-lab') {
        return [state, []]
      }
      const [nextModel] = updateSuperpositionLab(state.model, msg.msg)
      return [{ tag: 'superposition-lab', model: nextModel }, []]
    }

    case 'command-lab-msg': {
      if (state.tag !== 'command-lab') {
        return [state, []]
      }
      const [nextModel, commands] = updateCommandLab(state.model, msg.msg)
      return [
        { tag: 'command-lab', model: nextModel },
        commands.map((cmd): AppCmd => ({ tag: 'command-lab', cmd })),
      ]
    }

    case 'centurion-msg': {
      if (state.tag !== 'centurion-match') {
        return [state, []]
      }
      const [nextModel, commands] = updateCenturion(state.model, msg.msg)
      return [
        { tag: 'centurion-match', model: nextModel },
        commands.map((cmd): AppCmd => ({ tag: 'centurion', cmd })),
      ]
    }

    default:
      return assertNever(msg)
  }
}
