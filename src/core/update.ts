export type UpdateResult<Model, Cmd> = readonly [Model, readonly Cmd[]]

export type Update<Model, Msg, Cmd> = (
  model: Model,
  msg: Msg,
) => UpdateResult<Model, Cmd>

export function noCmd<Model, Cmd>(model: Model): UpdateResult<Model, Cmd> {
  return [model, []]
}

export function withCmd<Model, Cmd>(
  model: Model,
  cmd: Cmd,
): UpdateResult<Model, Cmd> {
  return [model, [cmd]]
}
