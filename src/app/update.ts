import { type UpdateResult, assertNever } from '../core/update'
import { initCenturionModel } from '../features/centurion-match/model'
import { updateCenturion } from '../features/centurion-match/update'
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
