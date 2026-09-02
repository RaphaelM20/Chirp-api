const { faker } = require("@faker-js/faker");
const prisma = require("../db/prisma");
const bcrypt = require("bcryptjs");

async function main() {
  // create 10 fake users
  for (let i = 0; i < 10; i++) {
    const hashedPassword = await bcrypt.hash("password123", 10);
    await prisma.user.create({
      data: {
        name: faker.person.fullName(),
        username: faker.internet.username(),
        email: faker.internet.email(),
        password: hashedPassword,
        picture: faker.image.avatar(),
        bio: faker.lorem.sentence(),
      },
    });
  }
  console.log("Seeded!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
