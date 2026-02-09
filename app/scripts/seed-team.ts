#!/usr/bin/env npx tsx
/**
 * Seed script to create API keys for team members
 * Run: npx tsx scripts/seed-team.ts
 *
 * NOTE: This script checks for existing users by email to prevent duplicates.
 */

import { createUser, findUserByEmail } from "../src/lib/auth";

interface TeamMember {
  name: string;
  email: string;
  role: "admin" | "member";
  monthlyBudget: number;
}

// Core team members - only these 3 for now
const TEAM_MEMBERS: TeamMember[] = [
  { name: "Vincent", email: "vincent@rodeo.ai", role: "admin", monthlyBudget: 100 },
  { name: "Pauline", email: "pauline@rodeo.ai", role: "admin", monthlyBudget: 100 },
  { name: "Remi", email: "remi@rodeo.ai", role: "admin", monthlyBudget: 100 },
];

async function seedTeam() {
  console.log("\x1b[35m");
  console.log("  ____           _            ");
  console.log(" |  _ \\ ___   __| | ___  ___  ");
  console.log(" | |_) / _ \\ / _` |/ _ \\/ _ \\ ");
  console.log(" |  _ < (_) | (_| |  __/ (_) |");
  console.log(" |_| \\_\\___/ \\__,_|\\___|\\___/ ");
  console.log("\x1b[0m");
  console.log("\nSetting up team API keys...\n");
  console.log("=".repeat(70));

  const results: { name: string; apiKey: string; isNew: boolean }[] = [];

  for (const member of TEAM_MEMBERS) {
    try {
      // Check if user already exists
      const existing = await findUserByEmail(member.email);
      if (existing) {
        console.log(`\x1b[33m⚠\x1b[0m ${member.name} already exists (${member.email})`);
        results.push({ name: member.name, apiKey: "(existing)", isNew: false });
        continue;
      }

      // Create new user
      const result = await createUser(
        member.name,
        member.email,
        member.role,
        member.monthlyBudget
      );

      console.log(`\x1b[32m✓\x1b[0m ${member.name} created`);
      results.push({ name: member.name, apiKey: result.apiKey, isNew: true });
    } catch (error: any) {
      console.error(`\x1b[31m✗\x1b[0m ${member.name}: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("\n\x1b[1mAPI Keys (save these securely!):\x1b[0m\n");

  for (const r of results) {
    if (r.isNew) {
      console.log(`  ${r.name}: \x1b[36m${r.apiKey}\x1b[0m`);
    } else {
      console.log(`  ${r.name}: \x1b[33m(already exists - use existing key)\x1b[0m`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("\nDone! Share API keys with team members.\n");
}

seedTeam().catch(console.error);
