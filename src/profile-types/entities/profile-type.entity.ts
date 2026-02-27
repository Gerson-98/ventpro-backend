import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('profile_types')
export class ProfileType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  code: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  active: boolean;
}
