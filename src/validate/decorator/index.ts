import { Type } from "class-transformer";
import {
  IsNumber as LibIsNumber,
  IsOptional,
  IsPhoneNumber as LibIsPhoneNumber,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from "class-validator";
import { CountryCode } from "libphonenumber-js";

export interface IValidationOptions extends ValidationOptions {
  required?: boolean;
}

/**
 * Custom PhoneNumber validator using class-transformer and class-validator
 */
export function IsPhoneNumber(
  region: CountryCode,
  validationOptions?: ValidationOptions
): PropertyDecorator {
  return function (target: Object, propertyKey: string | symbol) {
    Type(() => String)(target, propertyKey);
    LibIsPhoneNumber(region, validationOptions)(target, propertyKey);
  };
}

/**
 * Custom IsNumber decorator with optional support and transform
 */
export function IsNumber(
  validationOptions?: IValidationOptions
): PropertyDecorator {
  return function (target: Object, propertyKey: string | symbol) {
    const isRequired = validationOptions?.required ?? false;

    if (!isRequired) {
      IsOptional({ each: true })(target, propertyKey);
    }

    Type(() => Number)(target, propertyKey);
    LibIsNumber({ allowNaN: false }, validationOptions)(target, propertyKey);
  };
}

/**
 * Custom validator: checks if current property is longer than another property
 */
export function IsLongerThan(
  property: string,
  validationOptions: ValidationOptions = {}
): PropertyDecorator {
  return function (object: Object, propertyKey: string | symbol) {
    // Copy so a shared options object never receives another property's message
    const options: ValidationOptions = {
      ...validationOptions,
      message:
        validationOptions.message ??
        `${String(propertyKey)} must be longer than ${property}`,
    };

    registerDecorator({
      name: "isLongerThan",
      target: object.constructor,
      propertyName: propertyKey as string,
      constraints: [property],
      options,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];
          return (
            typeof value === "string" &&
            typeof relatedValue === "string" &&
            value.length > relatedValue.length
          );
        },
      },
    });
  };
}
