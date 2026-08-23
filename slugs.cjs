/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("./lib/generated/prisma/client")
const p = new PrismaClient()
;(async () => {
  const c = await p.category.findMany({
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
    take: 12,
  })
  const pr = await p.product.findMany({
    select: { slug: true, name: true, categoryId: true },
    take: 6,
  })
  console.log(JSON.stringify({ c, pr }))
  await p.$disconnect()
})()
