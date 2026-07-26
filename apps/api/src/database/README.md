# Database

prisma/schema.prisma defines the ERD (Spec section 3). repositories/ wraps all
data access -- no module queries Prisma directly outside its own repository.
