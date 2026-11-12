import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { EMAIL_MAX_LENGTH } from '../admin-credentials';

export class LoginDto {
  @IsString()
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  /** Upper bound keeps bcrypt work per request bounded. */
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}
