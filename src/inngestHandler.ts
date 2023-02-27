import fs from 'fs-extra'
import path from 'path'

import chalk from 'chalk'
import execa from 'execa'
import { Listr } from 'listr2'

import { colors, getPaths, writeFile } from '@redwoodjs/cli-helpers'

interface ErrorWithExitCode extends Error {
  exitCode?: number
}

function isErrorWithExitCode(e: unknown): e is ErrorWithExitCode {
  return typeof (e as ErrorWithExitCode)?.exitCode !== 'undefined'
}

const addWsContextComponent = (appTsx: string) => {
  var content = appTsx.split('\n')
  const index = content.findIndex((value) => /<Routes .*\/>/.test(value))
  const routesLine = content[index]
  if (!routesLine) {
    throw new Error('Could not find "<Routes />"')
  }

  const routesIndent = routesLine.match(/^\s*/)?.[0].length
  if (typeof routesIndent === 'undefined') {
    throw new Error('Could not find <Routes /> indentation')
  }
  
  const indent = ' '.repeat(routesIndent)

  content.splice(
    index,
    1,
    indent + '<WsContextProvider>',
    "  " + routesLine,
    indent + '</WsContextProvider>'
  )

  return content.join(`\n`)
}

const wsContextPath = () => {
  const wsContextPath = path.join(
    getPaths().web.components,
    'WsContext',
    'WsContext.tsx'
  )
  return wsContextPath
}

const wsContextExists = () => {
  // TODO: js support
  return fs.existsSync(wsContextPath())
}

export const handler = async ({ force }: { force: boolean }) => {
  const tasks = new Listr(
    [
      {
        title: 'Installing packages...',
        task: () => {
          return new Listr(
            [
              {
                title: 'Install inngest',
                task: () => {
                  execa.commandSync(
                    'yarn workspace api add inngest',
                    process.env['RWJS_CWD']
                      ? {
                          cwd: process.env['RWJS_CWD'],
                        }
                      : {}
                  )
                },
              },
            ],
            { rendererOptions: { collapse: false } }
          )
        },
      },
      {
        title: 'Configure Inngest...',
        task: () => {
          /**
           * Update api/server.config.js
           *  - Add the ws plugin
           *  - Add /ws websocket route handler
           * If existing config is detected an error will be thrown
           */

          const inngestServerFunctionTemplate = fs.readFileSync(
            path.resolve(
              __dirname,
              '..',
              'templates',
              'inngest.ts.template'
            ),
            'utf-8'
          )

          writeFile(
            path.join(getPaths().api.functions, 'inngest.ts'),
            inngestServerFunctionTemplate,
            { existingFiles: 'OVERWRITE' }
          )

          const SRC_INNGEST_PATH = path.join(getPaths().api.src, 'inngest')

          fs.ensureDirSync(SRC_INNGEST_PATH)

          const inngestClientTemplate = fs.readFileSync(
            path.resolve(
              __dirname,
              '..',
              'templates',
              'client.ts.template'
            ),
            'utf-8'
          )

          writeFile(
            path.join(SRC_INNGEST_PATH, 'client.ts'),
            inngestClientTemplate,
            { existingFiles: 'OVERWRITE' }
          )

          const inngestHelloWorldTemplate = fs.readFileSync(
            path.resolve(
              __dirname,
              '..',
              'templates',
              'helloWorld.ts.template'
            ),
            'utf-8'
          )

          return writeFile(
            path.join(SRC_INNGEST_PATH, 'helloWorld.ts'),
            inngestHelloWorldTemplate,
            { existingFiles: 'OVERWRITE' }
          )
        },
      },
    ],
    { rendererOptions: { collapse: false } }
  )

  try {
    await tasks.run()
  } catch (e) {
    if (e instanceof Error) {
      console.error(colors.error(e.message))
    } else {
      console.error(colors.error('Unknown error when running yargs tasks'))
    }

    if (isErrorWithExitCode(e)) {
      process.exit(e.exitCode)
    }

    process.exit(1)
  }
}
