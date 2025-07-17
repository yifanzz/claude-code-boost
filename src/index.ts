function greet(name: string): string {
  return `Hello, ${name}!`;
}

const message = greet('World');
console.log(message);

export { greet };