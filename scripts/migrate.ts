import { openDatabase, resolveDatabasePath } from "@/lib/database/client";

const database = openDatabase();
database.$client.close();
console.log(`Migrations applied to ${resolveDatabasePath()}`);
