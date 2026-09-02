'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { DRESS_STYLES } from '@/data/mockData';

export const BrowseByDressStyle: React.FC = () => {
  return (
    <section className="py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#F0F0F0] rounded-3xl p-6 sm:p-12 lg:p-16">
          <h2 className="font-integral text-2xl sm:text-4xl text-center text-black mb-8 sm:mb-14">
            BROWSE BY DRESS STYLE
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6">
            {/* Casual - Desktop 5 cols */}
            <Link
              href="/category?style=casual"
              className="md:col-span-4 relative h-48 sm:h-72 bg-white rounded-2xl overflow-hidden group shadow-sm hover:shadow-md transition-shadow"
            >
              <span className="absolute top-4 left-6 sm:top-6 sm:left-8 font-bold text-xl sm:text-3xl text-black z-10">
                Casual
              </span>
              <div className="absolute inset-0 flex justify-end">
                <div className="relative w-2/3 h-full">
                  <Image
                    src={DRESS_STYLES[0].image}
                    alt="Casual dress style"
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              </div>
            </Link>

            {/* Formal - Desktop 7 cols */}
            <Link
              href="/category?style=formal"
              className="md:col-span-8 relative h-48 sm:h-72 bg-white rounded-2xl overflow-hidden group shadow-sm hover:shadow-md transition-shadow"
            >
              <span className="absolute top-4 left-6 sm:top-6 sm:left-8 font-bold text-xl sm:text-3xl text-black z-10">
                Formal
              </span>
              <div className="absolute inset-0 flex justify-end">
                <div className="relative w-3/4 sm:w-2/3 h-full">
                  <Image
                    src={DRESS_STYLES[1].image}
                    alt="Formal dress style"
                    fill
                    sizes="(max-width: 768px) 100vw, 66vw"
                    className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              </div>
            </Link>

            {/* Party - Desktop 7 cols */}
            <Link
              href="/category?style=party"
              className="md:col-span-8 relative h-48 sm:h-72 bg-white rounded-2xl overflow-hidden group shadow-sm hover:shadow-md transition-shadow"
            >
              <span className="absolute top-4 left-6 sm:top-6 sm:left-8 font-bold text-xl sm:text-3xl text-black z-10">
                Party
              </span>
              <div className="absolute inset-0 flex justify-end">
                <div className="relative w-3/4 sm:w-2/3 h-full">
                  <Image
                    src={DRESS_STYLES[2].image}
                    alt="Party dress style"
                    fill
                    sizes="(max-width: 768px) 100vw, 66vw"
                    className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              </div>
            </Link>

            {/* Gym - Desktop 5 cols */}
            <Link
              href="/category?style=gym"
              className="md:col-span-4 relative h-48 sm:h-72 bg-white rounded-2xl overflow-hidden group shadow-sm hover:shadow-md transition-shadow"
            >
              <span className="absolute top-4 left-6 sm:top-6 sm:left-8 font-bold text-xl sm:text-3xl text-black z-10">
                Gym
              </span>
              <div className="absolute inset-0 flex justify-end">
                <div className="relative w-2/3 h-full">
                  <Image
                    src={DRESS_STYLES[3].image}
                    alt="Gym dress style"
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
