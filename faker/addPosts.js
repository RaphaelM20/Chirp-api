const prisma = require("../db/prisma");
const { faker } = require("@faker-js/faker");

async function main() {
  const users = await prisma.user.findMany();

  for (const user of users) {
    for (let i = 0; i < 3; i++) {
      await prisma.post.create({
        data: {
          content: faker.lorem.sentence(),
          userId: user.id,
        },
      });
    }
  }
  console.log("Posts added!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
