import fs from 'fs-extra'
import path from 'path'
import assert from 'assert'
import baretest from 'baretest'

import * as fixtures from './fixtures.js'
import graph from '../'

fixtures.setRoot(path.join(__dirname, 'fixtures'))

const DELAY = 500

const test = baretest('wdg')

const wait = t => new Promise(resolve => setTimeout(resolve, t))

function subscribe (event, instance) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject('timeout'), DELAY * 4)

    const close = instance.on(event, ids => {
      clearTimeout(timeout)
      close()
      resolve(ids)
    })
  })
}

/**
 * It's very important that each set of fixtures is written to separate directories
 */

/**
 * Note on the wait periods.
 *
 * Basically, after initializing fixtures and wdg, wait 1s, then run the test.
 *
 * @see https://github.com/fgnass/filewatcher/blob/master/test/index.js#L85
 */

test('ignores non-absolute paths', async () => {
  const files = {
    a: {
      url: './isAbs/a.js',
      content: `export default ''`
    }
  }

  const fsx = fixtures.create(files)
  const w = graph({ cwd: fixtures.getRoot() })

  const event = subscribe('error', w)

  w.add('./isAbs/a.js')

  const error = await event

  assert(/isAbs/.test(error))

  w.close()
  fsx.cleanup()
})

test('constructs valid tree', async () => {
  const files = {
    a: {
      url: './valid/a.js',
      content: `
        import a_a from './a_a'
        import a_b from './a_b'
        export default ''
      `
    },
    a_a: {
      url: './valid/a_a.js',
      content: `
        import a_a_a from './a_a_a'
        export default ''
      `
    },
    a_a_a: {
      url: './valid/a_a_a.js',
      content: `
        export default ''
      `
    },
    a_b: {
      url: './valid/a_b.js',
      content: `
        export default ''
      `
    }
  }

  const fsx = fixtures.create(files)
  const w = graph({ cwd: fixtures.getRoot() })
  w.add(fsx.files.a)

  await wait(DELAY)

  const tree = w.tree

  // entry
  assert(tree[fsx.files.a].pointer === 0)

  // children
  assert(
    tree[fsx.files.a].childrenPointers.includes(tree[fsx.files.a_a].pointer)
  )
  assert(
    tree[fsx.files.a].childrenPointers.includes(tree[fsx.files.a_b].pointer)
  )
  assert(
    tree[fsx.files.a_a].childrenPointers.includes(tree[fsx.files.a_a_a].pointer)
  )

  // parents
  assert(tree[fsx.files.a_a].parentPointers.includes(tree[fsx.files.a].pointer))
  assert(
    tree[fsx.files.a_a_a].parentPointers.includes(tree[fsx.files.a_a].pointer)
  )
  assert(tree[fsx.files.a_b].parentPointers.includes(tree[fsx.files.a].pointer))

  // pointers
  assert(tree[fsx.files.a_a].entryPointers.includes(tree[fsx.files.a].pointer))
  assert(
    tree[fsx.files.a_a_a].entryPointers.includes(tree[fsx.files.a].pointer)
  )
  assert(tree[fsx.files.a_b].entryPointers.includes(tree[fsx.files.a].pointer))

  w.close()
  fsx.cleanup()
})

test('constructs valid tree in inverse alpha/write order', async () => {
  const files = {
    b: {
      url: './reverse-valid/b.js',
      content: `
        import a from './a.js'
        export default ''
      `
    },
    a: {
      url: './reverse-valid/a.js',
      content: `
        export default ''
      `
    }
  }

  const fsx = fixtures.create(files)
  const w = graph({ cwd: fixtures.getRoot() })
  w.add(fsx.files.b)

  await wait(DELAY)

  const tree = w.tree

  assert(tree[fsx.files.b].childrenPointers.includes(tree[fsx.files.a].pointer))
  assert(tree[fsx.files.a].parentPointers.includes(tree[fsx.files.b].pointer))

  w.close()
  fsx.cleanup()
})

test('handles shared deps', async () => {
  const files = {
    a: {
      url: './shared-deps/a.js',
      content: `
        import c from './c.js'
        export default ''
      `
    },
    b: {
      url: './shared-deps/b.js',
      content: `
        import c from './c.js'
        export default ''
      `
    },
    c: {
      url: './shared-deps/c.js',
      content: `
        export default ''
      `
    }
  }

  const fsx = fixtures.create(files)
  const w = graph({ cwd: fixtures.getRoot() })
  w.add([fsx.files.a, fsx.files.b])

  await wait(DELAY)

  const tree = w.tree

  assert(tree[fsx.files.a].childrenPointers.includes(tree[fsx.files.c].pointer))
  assert(tree[fsx.files.b].childrenPointers.includes(tree[fsx.files.c].pointer))

  assert(tree[fsx.files.c].entryPointers.includes(tree[fsx.files.a].pointer))
  assert(tree[fsx.files.c].entryPointers.includes(tree[fsx.files.b].pointer))

  w.close()
  fsx.cleanup()
})

test('handles circular deps', async () => {
  const files = {
    a: {
      url: './circular/a.js',
      content: `
        import b from './b.js'
        export default ''
      `
    },
    b: {
      url: './circular/b.js',
      content: `
        import a from './a.js'
        export default ''
      `
    }
  }

  const fsx = fixtures.create(files)
  const w = graph({ cwd: fixtures.getRoot() })
  w.add([fsx.files.a, fsx.files.b])

  await wait(DELAY)

  const tree = w.tree

  assert(tree[fsx.files.a].childrenPointers.includes(tree[fsx.files.b].pointer))
  assert(tree[fsx.files.b].childrenPointers.includes(tree[fsx.files.a].pointer))

  w.close()
  fsx.cleanup()
})

test('handles inverse tree', async () => {
  const files = {
    a: {
      url: './inverse-tree/a.js',
      content: `
        import c from './c.js'
        export default ''
      `
    },
    b: {
      url: './inverse-tree/b.js',
      content: `
        import c from './c.js'
        export default ''
      `
    },
    c: {
      url: './inverse-tree/c.js',
      content: `
        import d from './d.js'
        export default ''
      `
    },
    d: {
      url: './inverse-tree/d.js',
      content: `
        export default ''
      `
    }
  }

  const fsx = fixtures.create(files)
  const w = graph({ cwd: fixtures.getRoot() })
  w.add([fsx.files.a, fsx.files.b])

  await wait(DELAY)

  const tree = w.tree

  assert(tree[fsx.files.d].entryPointers.includes(tree[fsx.files.a].pointer))
  assert(tree[fsx.files.d].entryPointers.includes(tree[fsx.files.b].pointer))

  w.close()
  fsx.cleanup()
})

test('emits change when entry file is updated', async () => {
  const files = {
    a: {
      url: './change/a.js',
      content: `
        export default ''
      `
    }
  }

  const fsx = fixtures.create(files)
  const w = graph({ cwd: fixtures.getRoot() })
  w.add(fsx.files.a)
  const event = subscribe('change', w)

  await wait(DELAY)

  fs.outputFileSync(
    fsx.files.a,
    `
      import a_a from './a_a.js'
      export default 'foo'
    `
  )

  const [file] = await event
  assert(file === fsx.files.a)

  w.close()
  fsx.cleanup()
})

test('emits change when nested children are updated', async () => {
  const files = {
    a: {
      url: './nested-change/a.js',
      content: `
        import a_a from './a_a.js'
        export default ''
      `
    },
    a_a: {
      url: './nested-change/a_a.js',
      content: `
        import a_a_a from './a_a_a'
        export default ''
      `
    },
    a_a_a: {
      url: './nested-change/a_a_a.js',
      content: `
        export default ''
      `
    }
  }

  const fsx = fixtures.create(files)

  await wait(DELAY)

  const w = graph({ cwd: fixtures.getRoot() })
  w.add(fsx.files.a)
  const event = subscribe('change', w)

  await wait(DELAY)

  fs.outputFileSync(
    fsx.files.a_a,
    `
      import a_a_a from './a_a_a'
      export default 'foo'
    `
  )
  const [file] = await event
  assert(file === fsx.files.a)

  const event2 = subscribe('change', w)

  await wait(DELAY)

  fs.outputFileSync(
    fsx.files.a_a_a,
    `
      export default 'foo'
    `
  )
  const [file2] = await event2
  assert(file2 === fsx.files.a)

  w.close()
  fsx.cleanup()
})

test('de-referenced nested child is ignored, then re-added', async () => {
  const files = {
    a: {
      url: './deref/a.js',
      content: `
        import a_a from './a_a.js'
        export default ''
      `
    },
    a_a: {
      url: './deref/a_a.js',
      content: `
        import a_a_a from './a_a_a'
        export default ''
      `
    },
    a_a_a: {
      url: './deref/a_a_a.js',
      content: `
        export default ''
      `
    }
  }

  const fsx = fixtures.create(files)
  const w = graph({ cwd: fixtures.getRoot() })
  w.add(fsx.files.a)

  await wait(DELAY)

  // de-reference, would trigger change
  fs.outputFileSync(fsx.files.a_a, `export default 'de-referenced'`)

  // wait for change event to pass
  await wait(DELAY)

  const changeOnDereferencedFile = subscribe('change', w)

  fs.outputFileSync(fsx.files.a_a_a, `export default 'bar'`)

  try {
    console.log(await changeOnDereferencedFile)
    assert(false)
  } catch (e) {
    assert(e === 'timeout')
  }

  // re-reference
  fs.outputFileSync(
    fsx.files.a_a,
    `
      import a_a_a from './a_a_a.js'
      export default 'foo'
    `
  )

  // await re-init
  await wait(DELAY)

  const changeOnRereferencedFile = subscribe('change', w)

  fs.outputFileSync(
    fsx.files.a_a_a,
    `
      export default 'referenced again'
    `
  )

  const [entryAgain] = await changeOnRereferencedFile
  assert(entryAgain === fsx.files.a)

  w.close()
  fsx.cleanup()
})

test('emits remove event when entry file is removed', async () => {
  const files = {
    a: {
      url: './remove/a.js',
      content: `
        export default ''
      `
    }
  }

  const fsx = fixtures.create(files)
  const w = graph({ cwd: fixtures.getRoot() })
  w.add(fsx.files.a)
  const event = subscribe('remove', w)

  await wait(DELAY)

  fs.removeSync(fsx.files.a)

  const [file] = await event
  assert(file === fsx.files.a)

  w.close()
  fsx.cleanup()
})

test(`when entry file is removed, its children are removed too and don't trigger an update`, async () => {
  const files = {
    a: {
      url: './removed-entry/a.js',
      content: `
      import a_a from './a_a.js'
        export default ''
      `
    },
    a_a: {
      url: './removed-entry/a_a.js',
      content: `
        export default ''
      `
    }
  }

  const fsx = fixtures.create(files)
  const w = graph({ cwd: fixtures.getRoot() })
  w.add(fsx.files.a)
  const event = subscribe('change', w)

  await wait(DELAY)

  fs.removeSync(fsx.files.a)

  // await re-start
  await wait(DELAY)

  fs.outputFileSync(fsx.files.a_a, `export default 'updated'`)

  try {
    await event
    assert(false)
  } catch (e) {
    assert(e === 'timeout')
  }

  assert(!w.tree[fsx.files.a])
  assert(!w.tree[fsx.files.a_a])

  w.close()
  fsx.cleanup()
})

test(`when child file is removed, triggers update and references are removed`, async () => {
  const files = {
    a: {
      url: './removed-children/a.js',
      content: `
      import a_a from './a_a.js'
        export default ''
      `
    },
    a_a: {
      url: './removed-children/a_a.js',
      content: `
        export default ''
      `
    }
  }

  const fsx = fixtures.create(files)
  const w = graph({ cwd: fixtures.getRoot() })
  w.add(fsx.files.a)
  const event = subscribe('change', w)

  await wait(DELAY)

  fs.removeSync(fsx.files.a_a)

  const [file] = await event
  assert(file === fsx.files.a)

  assert(!w.tree[fsx.files.a].childrenPointers.length)
  assert(!w.tree[fsx.files.a_a])

  w.close()
  fsx.cleanup()
})

test(`files removed from watching aren't watched`, async () => {
  const files = {
    a: {
      url: './remove-from-watch/a.js',
      content: `
        export default ''
      `
    },
    b: {
      url: './remove-from-watch/b.js',
      content: `
        export default ''
      `
    }
  }

  const fsx = fixtures.create(files)

  const w = graph({ cwd: fixtures.getRoot() })
  const event = subscribe('change', w)

  w.add(fsx.files.a)
  w.add(fsx.files.b)

  await wait(DELAY)

  fs.outputFileSync(
    fsx.files.a,
    `
      export default 'updated'
    `
  )

  const [file] = await event
  assert(file === fsx.files.a)

  w.remove(fsx.files.a)

  await wait(DELAY)

  const noChangeEvent = subscribe('change', w)

  fs.outputFileSync(
    fsx.files.a,
    `
      export default 'updated again'
    `
  )

  try {
    await noChangeEvent
    assert(false)
  } catch (e) {
    assert(e === 'timeout')
  }

  w.close()
  fsx.cleanup()
})

!(async function () {
  console.time('test')
  await test.run()
  console.timeEnd('test')
  process.exit()
})()