import {
  Get,
  HttpCode,
  Post,
  Delete,
  Put,
  Patch,
  Controller,
  ControllerOptions,
  HttpStatus,
  applyDecorators,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MethodGetOptions, MethodOptions } from '../../@types';

export function DefController(prefix?: string | string[]): ClassDecorator;
export function DefController(options: ControllerOptions): ClassDecorator;
export function DefController(
  options?: string | string[] | ControllerOptions,
): ClassDecorator {
  const nestController =
    options && !Array.isArray(options) && typeof options === 'object'
      ? Controller(options)
      : Controller(options as string | string[] | undefined);
  return applyDecorators(ApiBearerAuth(), nestController);
}

export function DefGet(
  path?: string | string[],
  options: MethodGetOptions = new MethodGetOptions(),
): MethodDecorator {
  const { statusCode = HttpStatus.OK, summary, responseType = undefined } =
    options || new MethodGetOptions();
  const decorators: Array<ClassDecorator | MethodDecorator | PropertyDecorator> = [
    HttpCode(statusCode),
    ApiOperation({ summary }),
    Get(path),
    responseType
      ? ApiResponse({ status: statusCode, type: responseType })
      : ApiResponse({ status: statusCode }),
  ];
  return applyDecorators(...decorators);
}

export function DefPost(
  path?: string | string[],
  options: MethodOptions = new MethodOptions(),
): MethodDecorator {
  const {
    statusCode = HttpStatus.OK,
    summary,
    responseType = undefined,
    bodyType = undefined,
  } = options || new MethodOptions();
  const decorators: Array<ClassDecorator | MethodDecorator | PropertyDecorator> = [
    HttpCode(statusCode),
    ApiOperation({ summary }),
    Post(path),
    responseType
      ? ApiResponse({ status: statusCode, type: responseType })
      : ApiResponse({ status: statusCode }),
  ];
  if (bodyType) {
    decorators.push(ApiBody({ type: bodyType }));
  }
  return applyDecorators(...decorators);
}

export function DefPut(
  path?: string | string[],
  options: MethodOptions = new MethodOptions(),
): MethodDecorator {
  const {
    statusCode = HttpStatus.OK,
    summary,
    responseType = undefined,
    bodyType = undefined,
  } = options || new MethodOptions();
  const decorators: Array<ClassDecorator | MethodDecorator | PropertyDecorator> = [
    HttpCode(statusCode),
    ApiOperation({ summary }),
    Put(path),
    responseType
      ? ApiResponse({ status: statusCode, type: responseType })
      : ApiResponse({ status: statusCode }),
  ];
  if (bodyType) {
    decorators.push(ApiBody({ type: bodyType }));
  }
  return applyDecorators(...decorators);
}

export function DefPatch(
  path?: string | string[],
  options: MethodOptions = new MethodOptions(),
): MethodDecorator {
  const {
    statusCode = HttpStatus.OK,
    summary,
    responseType = undefined,
    bodyType = undefined,
  } = options || new MethodOptions();
  const decorators: Array<ClassDecorator | MethodDecorator | PropertyDecorator> = [
    HttpCode(statusCode),
    ApiOperation({ summary }),
    Patch(path),
    responseType
      ? ApiResponse({ status: statusCode, type: responseType })
      : ApiResponse({ status: statusCode }),
  ];
  if (bodyType) {
    decorators.push(ApiBody({ type: bodyType }));
  }
  return applyDecorators(...decorators);
}

export function DefDelete(
  path?: string | string[],
  options: MethodOptions = new MethodOptions(),
): MethodDecorator {
  const {
    statusCode = HttpStatus.OK,
    summary,
    responseType = undefined,
    bodyType = undefined,
  } = options || new MethodOptions();
  const decorators: Array<ClassDecorator | MethodDecorator | PropertyDecorator> = [
    HttpCode(statusCode),
    ApiOperation({ summary }),
    Delete(path),
    responseType
      ? ApiResponse({ status: statusCode, type: responseType })
      : ApiResponse({ status: statusCode }),
  ];
  if (bodyType) {
    decorators.push(ApiBody({ type: bodyType }));
  }
  return applyDecorators(...decorators);
}
