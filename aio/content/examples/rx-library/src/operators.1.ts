// #docplaster
/*
  Because of how the code is merged together using the doc regions,
  we need to indent the imports with the function below.
*/
// #docregion
  import { of, filter, map, pipe } from 'rxjs';

// #enddocregion

export function docRegionDefault(console: Console) {
  // #docregion
  const nums = of(1, 2, 3, 4, 5);

  // Create a function that accepts an Observable.
  const squareOddVals = pipe(
    filter((n: number) => n % 2 === 1),
    map(n => n * n)
  );

  // Create an Observable that will run the filter and map functions
  const squareOdd = squareOddVals(nums);

  // Subscribe to run the combined functions
  squareOdd.subscribe(x => console.log(x));

  // #enddocregion
}
