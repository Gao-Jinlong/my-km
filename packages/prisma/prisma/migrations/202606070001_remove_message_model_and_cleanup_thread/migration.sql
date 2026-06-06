-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_threadId_fkey";

-- AlterTable
ALTER TABLE "Thread" DROP COLUMN "messageCount";

-- DropTable
DROP TABLE "Message";
