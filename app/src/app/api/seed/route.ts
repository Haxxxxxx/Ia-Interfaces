/**
 * Seed API - Creates initial admin user
 * POST /api/seed with secret key
 */
import { NextRequest, NextResponse } from "next/server";
import { createUser, findUserByEmail } from "@/lib/auth";

// Secret key to protect seeding (set in Firebase env)
const SEED_SECRET = process.env.SEED_SECRET || "rodeo-seed-2024";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { secret, name, email, role = "admin", budget = 100 } = body;

    // Verify secret
    if (secret !== SEED_SECRET) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email required" },
        { status: 400 }
      );
    }

    // Check if user exists
    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "User already exists", user: { name: existing.name, email: existing.email } },
        { status: 409 }
      );
    }

    // Create user
    const user = await createUser(name, email, role, budget);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      apiKey: user.fullApiKey,
      message: "Save this API key - it won't be shown again!",
    });
  } catch (error: any) {
    console.error("Seed error:", error);
    return NextResponse.json(
      { error: "Seed failed", details: error.message },
      { status: 500 }
    );
  }
}

// GET to check if seeding is available and debug environment
export async function GET() {
  const { useFirestore, getFirestoreDb } = await import("@/lib/firebase-admin");
  const { getAllUsers } = await import("@/lib/db-provider");

  let userCount = 0;
  let firestoreTest = "not tested";
  let rodeoUsers: string[] = [];

  try {
    if (useFirestore()) {
      const db = getFirestoreDb();
      // Try to query users with apiKeyHash field
      const snapshot = await db.collection("users").where("apiKeyHash", "!=", null).limit(5).get();
      rodeoUsers = snapshot.docs.map((d) => d.data().name || d.id);
      firestoreTest = `found ${snapshot.size} rodeo users`;
    }
    const allUsers = await getAllUsers();
    userCount = allUsers.length;
  } catch (e: any) {
    firestoreTest = `error: ${e.message}`;
  }

  return NextResponse.json({
    available: true,
    message: "POST with { secret, name, email, role?, budget? } to create user",
    debug: {
      useFirestore: useFirestore(),
      FIREBASE_CONFIG: !!process.env.FIREBASE_CONFIG,
      K_SERVICE: process.env.K_SERVICE,
      firestoreTest,
      userCount,
      rodeoUsers,
    },
  });
}
