import type { ParseResult } from '../../core/parsing/types'
import { buildSuperpositionRenderModel } from '../../core/superposition/build-render-model'
import { parseArrowList } from '../../core/superposition/parse-arrow-list'
import { parseFenList } from '../../core/superposition/parse-fen-list'
import type {
  ArrowSegment,
  FenBoardPosition,
  SuperpositionRenderModel,
} from '../../core/superposition/types'

export interface SuperpositionLabModel {
  readonly fenInput: string
  readonly arrowInput: string
  readonly fenParse: ParseResult<readonly FenBoardPosition[]>
  readonly arrowParse: ParseResult<readonly ArrowSegment[]>
  readonly renderModel: SuperpositionRenderModel
}

export const DEFAULT_SUPERPOSITION_FEN_INPUT = [
  'rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 2 3',
].join('\n')

export const DEFAULT_SUPERPOSITION_ARROW_INPUT = ['e2->e4', 'd2->d4', 'g1->f3'].join(
  '\n',
)

function deriveRenderModel(
  fenParse: ParseResult<readonly FenBoardPosition[]>,
  arrowParse: ParseResult<readonly ArrowSegment[]>,
): SuperpositionRenderModel {
  const positions = fenParse.tag === 'valid' ? fenParse.value : []
  const arrows = arrowParse.tag === 'valid' ? arrowParse.value : []
  return buildSuperpositionRenderModel(positions, arrows)
}

export function buildSuperpositionLabModel(
  fenInput: string,
  arrowInput: string,
): SuperpositionLabModel {
  const fenParse = parseFenList(fenInput)
  const arrowParse = parseArrowList(arrowInput)

  return {
    fenInput,
    arrowInput,
    fenParse,
    arrowParse,
    renderModel: deriveRenderModel(fenParse, arrowParse),
  }
}

export function initSuperpositionLabModel(): SuperpositionLabModel {
  return buildSuperpositionLabModel(
    DEFAULT_SUPERPOSITION_FEN_INPUT,
    DEFAULT_SUPERPOSITION_ARROW_INPUT,
  )
}
