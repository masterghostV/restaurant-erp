import { IsNotEmpty, IsString, IsNumber, IsOptional, IsEmail, MinLength, IsIn, IsInt, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRestaurantDto {
  @ApiProperty({ example: 'My Tasty Restaurant' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: '123 Food Street, New York' })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({ example: '+1234567890' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ example: '27AAAAA1111A1Z1', required: false })
  @IsOptional()
  @IsString()
  gstNumber?: string;
}

export class OnboardRestaurantDto extends CreateRestaurantDto {
  @ApiProperty({ example: 'owner@myrestaurant.com', description: "The new restaurant owner's login email" })
  @IsEmail()
  ownerEmail: string;

  @ApiProperty({ example: 'Restaurant Owner Name' })
  @IsNotEmpty()
  @IsString()
  ownerName: string;

  @ApiProperty({ example: 'a-temporary-password', description: 'Owner should change this after first login' })
  @IsNotEmpty()
  @MinLength(6)
  ownerPassword: string;

  @ApiProperty({ example: '1234567890', required: false })
  @IsOptional()
  @IsString()
  ownerPhone?: string;
}

export class UpdateRestaurantStatusDto {
  @ApiProperty({ example: 'SUSPENDED', enum: ['ACTIVE', 'SUSPENDED'] })
  @IsNotEmpty()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status: string;
}

// BILLING is set by the waiter's "send to cashier" button, so it must stay allowed.
export const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'BILLING', 'RESERVED', 'CLEANING'];

export class CreateTableDto {
  @ApiProperty({ example: 'Table 5' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  number: string;

  @ApiProperty({ example: 4, description: 'How many guests the table seats (1-50)' })
  @IsInt()
  @Min(1)
  @Max(50)
  capacity: number;

  @ApiProperty({ example: 'AVAILABLE', required: false, enum: TABLE_STATUSES })
  @IsOptional()
  @IsIn(TABLE_STATUSES)
  status?: string;

  @ApiProperty({
    example: 'restaurant-uuid',
    required: false,
    description:
      'Only used when the Site Owner adds a table. Owners and Managers always add to their own restaurant — this field is ignored for them.',
  })
  @IsOptional()
  @IsString()
  restaurantId?: string;
}

export class UpdateTableStatusDto {
  @ApiProperty({ example: 'OCCUPIED', enum: TABLE_STATUSES })
  @IsNotEmpty()
  @IsIn(TABLE_STATUSES)
  status: string;
}
