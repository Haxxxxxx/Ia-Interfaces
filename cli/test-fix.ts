/**
 * Simple test file for CodeEdit agent testing
 */

// Greets a user by name
function greetUser(name: string): string {
  const greeting = `Hello, ${name}!`;
  return greeting;
}

function addNumbers(a: number, b: number): number {
  return a + b;
}

function processData(data: string[]): number {
  return data.length;
}

export { greetUser, addNumbers, processData };
